import type * as declared from "test-assert-lite"

import type {ReporterControl} from "./reporter.ts"
import type {HarnessState, SuiteNode} from "./suite.ts"
import {resetHarnessState} from "./suite.ts"
import type {RunState} from "./tester.ts"
import {runTest} from "./tester.ts"

const runHooks = async (state: RunState, list: declared.TAL.HookFn[], label: string): Promise<void> => {
    for (const fn of list) {
        try {
            await fn()
        } catch (e) {
            state.success = false
            await state.reporter.emit("test:fail", {
                name: label, nesting: 0, testNumber: 0,
                details: {duration_ms: 0, type: "suite", error: e ?? new Error(`${label} failed`)},
            })
        }
    }
}

// Runs one suite: body, then before, then children in declaration order,
// then after. The children queue mixes describe and it, and a describe
// recurses through here again.
const walk = async (state: RunState, suite: SuiteNode): Promise<void> => {
    if (suite.nesting >= 0) state.counters.suites++

    const skip = suite.options.skip
    if (skip === true || "string" === typeof skip) return

    const previous = state.harness.currentSuite
    state.harness.currentSuite = suite
    try {
        // The body runs for the first time here, so both the registration
        // of children and an async body settle while the walk is still
        // inside this suite.
        const body = suite.fn?.({name: suite.name})
        if (body != null) await body
    } catch (e) {
        state.success = false
        await state.reporter.emit("test:fail", {
            name: suite.name, nesting: suite.nesting, testNumber: state.counters.suites,
            details: {duration_ms: 0, type: "suite", error: e ?? new Error("suite failed")},
        })
        state.harness.currentSuite = previous
        return
    }
    state.harness.currentSuite = previous

    const outer = state.ancestors
    state.ancestors = suite.nesting < 0 ? outer : [...outer, suite]

    await runHooks(state, suite.before, `${suite.name || "root"} before hook`)

    for (const child of suite.children) {
        if (child.kind === "suite") await walk(state, child)
        else await runTest(state, child, suite.nesting + 1)
    }

    await runHooks(state, suite.after, `${suite.name || "root"} after hook`)

    state.ancestors = outer
}

export const createRun = (
    harness: HarnessState,
    control: ReporterControl,
    assert: declared.TAL.AssertMethods,
): typeof declared.run => async () => {
    const started = performance.now()
    const state: RunState = {
        counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0},
        success: true,
        ancestors: [],
        harness,
        reporter: control.reporter,
        assert,
    }

    await walk(state, harness.rootSuite)

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
    await control.close()
    resetHarnessState(harness)
    control.reset()

    return summary
}
