import type * as declared from "test-assert-lite"
import {TestRunnerError, testRunnerError} from "./common/test-runner-error.ts"
import type {ReporterControl} from "./reporter.ts"
import type {HarnessState, SuiteNode} from "./suite.ts"
import {resetHarnessState} from "./suite.ts"
import type {Outcome, RunState} from "./tester.ts"
import {abortTest, announceAncestors, runTest} from "./tester.ts"

const CANCELLED_MESSAGE = "test did not finish before its parent and was cancelled"

const cancelledByParent = (): TestRunnerError => new TestRunnerError(CANCELLED_MESSAGE, "cancelledByParent")

// Runs the hooks in order and stops at the first failure, which is
// returned as the error to charge to the suite.
const runHooks = async (list: declared.TAL.HookFn[]): Promise<Error | undefined> => {
    for (const fn of list) {
        try {
            await fn()
        } catch (e) {
            return testRunnerError(e, "hookFailed")
        }
    }
    return undefined
}

// The suite's own result, once every child has been reported. A suite has
// no test:start of its own; announcing the pending ancestors covers it.
const reportSuite = async (
    state: RunState, suite: SuiteNode, testNumber: number, started: number,
    result: {error?: Error, skip?: string | true},
): Promise<void> => {
    await announceAncestors(state)
    const base = {name: suite.name, nesting: suite.nesting, testNumber}
    const duration_ms = performance.now() - started

    const skip = result.skip != null ? {skip: result.skip} : {}

    // A skipped suite under a failed setup keeps its skip on the failure
    // event, which is how node:test counts it as skipped yet fails the run.
    if (result.error != null) {
        state.success = false
        await state.reporter.emit("test:fail", {
            ...base, ...skip,
            details: {duration_ms, type: "suite", error: result.error},
        })
    } else {
        await state.reporter.emit("test:pass", {...base, ...skip, details: {duration_ms, type: "suite"}})
    }
}

const isSkipped = (suite: SuiteNode): boolean => {
    const {skip} = suite.options
    return skip === true || "string" === typeof skip
}

// The body runs for the first time here, so both the registration of
// children and an async body settle while the walk is still inside this
// suite. Its own error, if any, is the suite's to carry.
const runBody = async (state: RunState, suite: SuiteNode): Promise<Error | undefined> => {
    const previous = state.harness.currentSuite
    state.harness.currentSuite = suite
    try {
        const body = suite.fn?.({name: suite.name})
        if (body != null) await body
        return undefined
    } catch (e) {
        return testRunnerError(e, "testCodeFailure")
    } finally {
        state.harness.currentSuite = previous
    }
}

// Reports a suite that will not run under the given error, and everything
// below it as cancelled. The body still runs, since that is what registers
// the children node:test would already know about.
const cancelSuite = async (state: RunState, suite: SuiteNode, testNumber: number, error: Error): Promise<void> => {
    state.counters.suites++
    const started = performance.now()
    await withAncestor(state, suite, async () => {
        if (isSkipped(suite)) {
            await reportSuite(state, suite, testNumber, started, {error, skip: suite.options.skip as string | true})
            return
        }
        const bodyError = await runBody(state, suite)
        await cancelChildren(state, suite)
        await reportSuite(state, suite, testNumber, started, {error: bodyError ?? error})
    })
}

// Reports every registered child as cancelled without running it, as
// node:test does when a suite's before hook or body fails.
const cancelChildren = async (state: RunState, suite: SuiteNode): Promise<void> => {
    let number = 0
    for (const child of suite.children) {
        number++
        if (child.kind === "suite") {
            await cancelSuite(state, child, number, cancelledByParent())
        } else {
            await abortTest(state, child, suite.nesting + 1, number, cancelledByParent(), "cancelled")
        }
    }
}

// The root has no result event of its own, so node:test charges a failing
// root before hook to each direct child: a test fails with the hook's error,
// a suite fails with it and cancels its own children.
const failChildren = async (state: RunState, suite: SuiteNode, error: Error): Promise<void> => {
    let number = 0
    for (const child of suite.children) {
        number++
        if (child.kind === "suite") {
            await cancelSuite(state, child, number, error)
        } else {
            await abortTest(state, child, suite.nesting + 1, number, error, "failed")
        }
    }
}

const withAncestor = async <T>(state: RunState, suite: SuiteNode, fn: () => Promise<T>): Promise<T> => {
    const outer = state.ancestors
    state.ancestors = suite.nesting < 0 ? outer : [...outer, suite]
    try {
        return await fn()
    } finally {
        state.ancestors = outer
    }
}

// Runs one suite: body, then before, then children in declaration order,
// then after. The children queue mixes describe and it, and a describe
// recurses through here again.
const walk = async (state: RunState, suite: SuiteNode, testNumber: number): Promise<Outcome> => {
    const root = suite.nesting < 0
    if (!root) state.counters.suites++
    const started = performance.now()

    if (isSkipped(suite)) {
        const skip = suite.options.skip as string | true
        await withAncestor(state, suite, () => reportSuite(state, suite, testNumber, started, {skip}))
        return "skipped"
    }

    return withAncestor(state, suite, async () => {
        let error = await runBody(state, suite)
        if (error == null) error = await runHooks(suite.before)

        let failedChildren = 0
        if (error != null) {
            // Nothing below a broken setup may run.
            if (root) {
                await failChildren(state, suite, error)
            } else {
                await cancelChildren(state, suite)
            }
        } else {
            let number = 0
            for (const child of suite.children) {
                number++
                const outcome = child.kind === "suite"
                    ? await walk(state, child, number)
                    : await runTest(state, child, suite.nesting + 1, number)
                if (outcome === "failed" || outcome === "cancelled") failedChildren++
            }
        }

        // after runs whatever happened above, as it does in node:test.
        const setupError = error
        const afterError = await runHooks(suite.after)
        error ??= afterError

        if (root) {
            // The root cannot carry a result, so a failing root hook that no
            // child could be charged with is reported on its own and left out
            // of the counts. node:test lets an empty run pass here; a failed
            // setup should never be green, so success is cleared regardless.
            const orphaned = [
                ...(setupError != null && !suite.children.length ? [["root before hook", setupError]] : []),
                ...(afterError != null ? [["root after hook", afterError]] : []),
            ] as [string, Error][]
            for (const [name, hookError] of orphaned) {
                await state.reporter.emit("test:fail", {
                    name, nesting: 0, testNumber: 0,
                    details: {duration_ms: 0, type: "suite", error: hookError},
                })
            }
            if (error != null) state.success = false
            return error != null || failedChildren ? "failed" : "passed"
        }

        if (error == null && failedChildren) {
            error = new TestRunnerError(`${failedChildren} subtest${failedChildren === 1 ? "" : "s"} failed`, "subtestsFailed")
        }
        await reportSuite(state, suite, testNumber, started, {error})
        return error != null ? "failed" : "passed"
    })
}

export const createRun = (
    harness: HarnessState,
    control: ReporterControl,
    assert: declared.TAL.AssertMethods,
): typeof declared.run => {
    let running = false

    return async () => {
        if (running) throw new Error("run() is already running")
        running = true

        let result: declared.TAL.TestSummary | undefined
        let failed = false
        let failure: unknown
        try {
            await control.begin()
            result = await runOnce(harness, control, assert)
        } catch (error) {
            failed = true
            failure = error
        }

        try {
            await control.close()
        } catch (error) {
            if (!failed) {
                failed = true
                failure = error
            }
        } finally {
            // A partially executed registry is unsafe to retry. Configuration
            // lives outside the per-run reporter Pipe and remains installed.
            resetHarnessState(harness)
            running = false
        }

        if (failed) throw failure
        return result!
    }
}

const runOnce = async (
    harness: HarnessState,
    control: ReporterControl,
    assert: declared.TAL.AssertMethods,
): Promise<declared.TAL.TestSummary> => {
    const started = performance.now()
    const state: RunState = {
        counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0},
        success: true,
        ancestors: [],
        harness,
        reporter: control.reporter,
        assert,
    }

    await walk(state, harness.rootSuite, 0)

    const duration_ms = performance.now() - started
    const summary: declared.TAL.TestSummary = {
        counts: {...state.counters},
        duration_ms,
        success: state.success,
    }

    for (const [label, value] of [
        ["tests", state.counters.tests], ["suites", state.counters.suites],
        ["pass", state.counters.passed], ["fail", state.counters.failed],
        ["cancelled", state.counters.cancelled], ["skipped", state.counters.skipped],
        ["duration_ms", duration_ms],
    ] as [string, number][]) {
        await state.reporter.emit("test:diagnostic", {message: `${label} ${value}`, nesting: 0, level: "info"})
    }

    await state.reporter.emit("test:summary", summary)
    return summary
}
