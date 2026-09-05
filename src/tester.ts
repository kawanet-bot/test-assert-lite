import type * as declared from "test-assert-lite"

import {TestRunnerError, toError} from "./common/test-runner-error.ts"
import type {Args, HarnessState, TestNode} from "./suite.ts"
import {nameOf, normalize} from "./suite.ts"

type TestFn = declared.TAL.TestFn

type Counters = declared.TAL.TestSummary["counts"]

// How one test or suite ended, as its parent sees it. A parent whose child
// failed or was cancelled fails in turn, as it does in node:test.
export type Outcome = "passed" | "failed" | "cancelled" | "skipped"

// A suite, or a test whose body is running, above the current point of the
// walk. Either owes a test:start before the first result below it.
export interface Ancestor {
    name: string
    nesting: number
    announced: boolean
}

// State shared across the walk: the counters, and the ancestors whose
// heading has not been emitted yet.
export interface RunState {
    counters: Counters
    success: boolean
    ancestors: Ancestor[]
    // The output belongs to the harness, so it travels with the walk.
    reporter: declared.TAL.Reporter
    // t.assert uses the harness's assert as well, so that once it takes
    // options, what a test body sees stays consistent within one run().
    assert: declared.TAL.AssertMethods
    // Carried along to flip the flag that bars registration.
    harness: HarnessState
}

const timeoutAfter = (ms: number): {promise: Promise<never>, error: TestRunnerError, cancel: () => void} => {
    let timer: ReturnType<typeof setTimeout>
    const error = new TestRunnerError(`test timed out after ${ms}ms`, "testTimeoutFailure")
    const promise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(error), ms)
    })
    return {promise, error, cancel: () => clearTimeout(timer)}
}

// Emits test:start for the ancestors still pending. The reporter turns
// those into headings once a result arrives.
export const announceAncestors = async (state: RunState): Promise<void> => {
    for (const ancestor of state.ancestors) {
        if (ancestor.announced || ancestor.nesting < 0) continue
        ancestor.announced = true
        await state.reporter.emit("test:start", {name: ancestor.name, nesting: ancestor.nesting})
    }
}

// A subtest may already have announced its parent, in which case the
// parent's own start is not repeated.
const announce = async (state: RunState, self: Ancestor): Promise<void> => {
    await announceAncestors(state)
    if (self.announced) return
    self.announced = true
    await state.reporter.emit("test:start", {name: self.name, nesting: self.nesting})
}

interface Context extends declared.TAL.TestContext {
    skipped: string | true | undefined
    pending: Promise<Outcome>[]
    // The tail of the subtest chain and how many are still running: node:test
    // runs subtests one at a time, so a new one waits for the previous one
    // whether awaited or not, but the first starts right away, synchronously.
    last: Promise<unknown>
    active: number
    subtests: number
}

const makeContext = (state: RunState, name: string, nesting: number): Context => {
    const context: Context = {
        name,
        assert: state.assert,
        skipped: undefined,
        pending: [],
        last: Promise.resolve(),
        active: 0,
        subtests: 0,
        skip: (message) => {
            // As in node:test the body is not interrupted; only the verdict changes.
            context.skipped = message ?? true
        },
        diagnostic: (message) => {
            void state.reporter.emit("test:diagnostic", {message, nesting, level: "info"})
        },
        test: async (...args: Args<TestFn>) => {
            const parsed = normalize<TestFn>(args)
            const node: TestNode = {
                kind: "test", name: nameOf(parsed.name, parsed.fn),
                options: parsed.options, fn: parsed.fn,
            }
            // Started here when nothing else is running, so the body reaches
            // its first await before t.test() returns, as in node:test.
            const testNumber = ++context.subtests
            const start = (): Promise<Outcome> => runTest(state, node, nesting + 1, testNumber).finally(() => {
                context.active--
            })
            context.active++
            const promise = context.active === 1 ? start() : context.last.then(start)
            context.last = promise
            context.pending.push(promise)
            await promise
        },
    }
    return context
}

const skipOf = (node: TestNode): string | true | undefined => {
    const {skip} = node.options
    return skip === true || "string" === typeof skip ? skip : undefined
}

// Reports a test that never ran: cancelled when its parent gave up, or
// failed when node:test would charge the parent's hook error to it. One
// marked skip keeps its skip and is counted as skipped, though the event
// and the outcome still carry the failure, as they do in node:test.
export const abortTest = async (
    state: RunState, node: TestNode, nesting: number, testNumber: number,
    error: Error, outcome: "failed" | "cancelled",
): Promise<Outcome> => {
    const {counters} = state
    const skip = skipOf(node)
    counters.tests++
    if (skip != null) counters.skipped++
    else if (outcome === "failed") counters.failed++
    else counters.cancelled++
    state.success = false

    await announce(state, {name: node.name, nesting, announced: false})
    await state.reporter.emit("test:fail", {
        name: node.name, nesting, testNumber,
        ...(skip != null ? {skip} : {}),
        details: {duration_ms: 0, type: "test", error},
    })
    return outcome
}

export const runTest = async (state: RunState, node: TestNode, nesting: number, testNumber: number): Promise<Outcome> => {
    const {counters} = state
    const skip = node.options.skip
    const skipped = skip === true || "string" === typeof skip

    counters.tests++
    const started = performance.now()
    const self: Ancestor = {name: node.name, nesting, announced: false}

    if (skipped || node.fn == null) {
        if (skipped) counters.skipped++
        else counters.passed++
        await announce(state, self)
        await state.reporter.emit("test:pass", {
            name: node.name, nesting, testNumber,
            ...(skipped ? {skip: "string" === typeof skip ? skip : true} : {}),
            details: {duration_ms: performance.now() - started, type: "test"},
        })
        return skipped ? "skipped" : "passed"
    }

    const context = makeContext(state, node.name, nesting)
    const wasInTestBody = state.harness.inTestBody
    state.harness.inTestBody = true
    // While the body runs this test is an ancestor of its subtests, so a
    // subtest's result announces it first, as node:test orders the starts.
    const outer = state.ancestors
    state.ancestors = [...outer, self]

    let error: Error | undefined
    let timedOut = false
    let failedSubtests = 0
    try {
        const {timeout} = node.options
        const body = Promise.resolve(node.fn(context))
        if (timeout != null && timeout > 0) {
            const timer = timeoutAfter(timeout)
            try {
                await Promise.race([body, timer.promise])
            } catch (e) {
                timedOut = e === timer.error
                throw e
            } finally {
                timer.cancel()
            }
        } else {
            await body
        }
        // An unawaited t.test() is still finished rather than dropped, which
        // is where node:test gives up on it.
        while (context.pending.length) {
            const outcome = await context.pending.shift()
            if (outcome === "failed" || outcome === "cancelled") failedSubtests++
        }
    } catch (e) {
        error = toError(e, "testCodeFailure")
    } finally {
        state.harness.inTestBody = wasInTestBody
        state.ancestors = outer
    }

    // A parent whose subtest failed fails in turn, as in node:test.
    if (error == null && failedSubtests) {
        error = new TestRunnerError(`${failedSubtests} subtest${failedSubtests === 1 ? "" : "s"} failed`, "subtestsFailed")
    }

    const duration_ms = performance.now() - started
    await announce(state, self)
    const runtimeSkip = context.skipped

    if (error != null) {
        // A skip called from the body outranks the failure in the count, as
        // it does in node:test, and a timeout files under cancelled. The
        // outcome still tells the parent about the failure.
        if (runtimeSkip !== undefined) counters.skipped++
        else if (timedOut) counters.cancelled++
        else counters.failed++
        state.success = false
        await state.reporter.emit("test:fail", {
            name: node.name, nesting, testNumber,
            ...(runtimeSkip !== undefined ? {skip: runtimeSkip} : {}),
            details: {duration_ms, type: "test", error},
        })
        return timedOut ? "cancelled" : "failed"
    }

    if (runtimeSkip !== undefined) counters.skipped++
    else counters.passed++

    await state.reporter.emit("test:pass", {
        name: node.name, nesting, testNumber,
        ...(runtimeSkip !== undefined ? {skip: runtimeSkip} : {}),
        details: {duration_ms, type: "test"},
    })
    return runtimeSkip !== undefined ? "skipped" : "passed"
}
