import type * as declared from "test-assert-lite"

import type {Args, HarnessState, SuiteNode, TestNode} from "./suite.ts"
import {nameOf, normalize} from "./suite.ts"

type TestFn = declared.TAL.TestFn

type Counters = declared.TAL.TestSummary["counts"]

// State shared across the walk: the counters, and the ancestors whose
// heading has not been emitted yet.
export interface RunState {
    counters: Counters
    success: boolean
    ancestors: SuiteNode[]
    // The output belongs to the harness, so it travels with the walk.
    reporter: declared.TAL.Reporter
    // t.assert uses the harness's assert as well, so that once it takes
    // options, what a test body sees stays consistent within one run().
    assert: declared.TAL.AssertMethods
    // Carried along to flip the flag that bars registration.
    harness: HarnessState
}

const timeoutAfter = (ms: number): {promise: Promise<never>, cancel: () => void} => {
    let timer: ReturnType<typeof setTimeout>
    const promise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`test timed out after ${ms}ms`)), ms)
    })
    return {promise, cancel: () => clearTimeout(timer)}
}

// Emits test:start for the ancestors still pending, then for this test.
// The reporter turns those into headings.
const announce = async (state: RunState, name: string, nesting: number): Promise<void> => {
    for (const suite of state.ancestors) {
        if (suite.announced || suite.nesting < 0) continue
        suite.announced = true
        await state.reporter.emit("test:start", {name: suite.name, nesting: suite.nesting})
    }
    await state.reporter.emit("test:start", {name, nesting})
}

interface Context extends declared.TAL.TestContext {
    skipped: string | true | undefined
    pending: Promise<void>[]
}

const makeContext = (state: RunState, name: string, nesting: number): Context => {
    const context: Context = {
        name,
        assert: state.assert,
        skipped: undefined,
        pending: [],
        skip: (message) => {
            // As in node:test the body is not interrupted; only the verdict changes.
            context.skipped = message ?? true
        },
        diagnostic: (message) => {
            void state.reporter.emit("test:diagnostic", {message, nesting, level: "info"})
        },
        test: (...args: Args<TestFn>) => {
            const parsed = normalize<TestFn>(args)
            // The subtest starts where it is called, so awaiting it lets the
            // child finish before the parent resumes.
            const promise = runTest(state, {
                kind: "test", name: nameOf(parsed.name, parsed.fn),
                options: parsed.options, fn: parsed.fn,
            }, nesting + 1)
            context.pending.push(promise)
            return promise
        },
    }
    return context
}

export const runTest = async (state: RunState, node: TestNode, nesting: number): Promise<void> => {
    const {counters} = state
    const skip = node.options.skip
    const skipped = skip === true || "string" === typeof skip

    counters.tests++
    const started = performance.now()

    if (skipped || node.fn == null) {
        if (skipped) counters.skipped++
        else counters.passed++
        await announce(state, node.name, nesting)
        await state.reporter.emit("test:pass", {
            name: node.name, nesting, testNumber: counters.tests,
            ...(skipped ? {skip: "string" === typeof skip ? skip : true} : {}),
            details: {duration_ms: performance.now() - started, type: "test"},
        })
        return
    }

    const context = makeContext(state, node.name, nesting)
    const wasInTestBody = state.harness.inTestBody
    state.harness.inTestBody = true

    let error: unknown
    try {
        const {timeout} = node.options
        const body = Promise.resolve(node.fn(context))
        if (timeout != null && timeout > 0) {
            const timer = timeoutAfter(timeout)
            try {
                await Promise.race([body, timer.promise])
            } finally {
                timer.cancel()
            }
        } else {
            await body
        }
        // An unawaited t.test() is still finished rather than dropped, which
        // is where node:test gives up on it.
        while (context.pending.length) await context.pending.shift()
    } catch (e) {
        error = e ?? new Error("test failed")
    } finally {
        state.harness.inTestBody = wasInTestBody
    }

    const duration_ms = performance.now() - started
    await announce(state, node.name, nesting)

    if (error !== undefined) {
        counters.failed++
        state.success = false
        await state.reporter.emit("test:fail", {
            name: node.name, nesting, testNumber: counters.tests,
            details: {duration_ms, type: "test", error},
        })
        return
    }

    const runtimeSkip = context.skipped
    if (runtimeSkip !== undefined) counters.skipped++
    else counters.passed++

    await state.reporter.emit("test:pass", {
        name: node.name, nesting, testNumber: counters.tests,
        ...(runtimeSkip !== undefined ? {skip: runtimeSkip} : {}),
        details: {duration_ms, type: "test"},
    })
}
