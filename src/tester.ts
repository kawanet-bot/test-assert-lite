import type * as declared from "test-assert-lite"
import {TesterError, cancelledByParent, parentAlreadyFinished, testRunnerError} from "./common/tester-error.ts"
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
    // Work a verdict did not wait for: the body of a timed out test and the
    // subtests it still had in flight. The run lets it settle before the
    // summary, so nothing a test does afterwards lands outside the run.
    lingering: Set<Promise<unknown>>
    // Subtests declared after their parent was reported. node:test hands
    // them to the root: they run after its registered children, numbered
    // after them, and fail as parentAlreadyFinished whatever their body does.
    late: LateTest[]
    lateCount: number
    // Wakes the drain when a late subtest arrives while it waits on the
    // bodies: one of them may be waiting on that very subtest.
    wake: (() => void) | undefined
    // Set once the run has drained the two lists above. A subtest declared
    // after that has no run left to belong to and is dropped.
    closed: boolean
}

interface LateTest {
    context: Context
    resolve: () => void
}

const timeoutAfter = (ms: number): {promise: Promise<never>, error: TesterError, cancel: () => void} => {
    let timer: ReturnType<typeof setTimeout>
    const error = new TesterError(`test timed out after ${ms}ms`, "testTimeoutFailure")
    const promise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(error), ms)
    })
    return {promise, error, cancel: () => clearTimeout(timer)}
}

// Emits test:start for the ancestors still pending. The reporter turns
// those into headings once a result arrives.
export const announceAncestors = async (state: RunState): Promise<void> => {
    await announceChain(state, state.ancestors)
}

const announceChain = async (state: RunState, chain: Ancestor[]): Promise<void> => {
    for (const ancestor of chain) {
        if (ancestor.announced || ancestor.nesting < 0) continue
        ancestor.announced = true
        await state.reporter.emit("test:start", {name: ancestor.name, nesting: ancestor.nesting})
    }
}

// A subtest may already have announced its parent, in which case the
// parent's own start is not repeated.
const announce = async (state: RunState, self: Ancestor): Promise<void> => {
    await announceChain(state, [...state.ancestors, self])
}

// One test as the runner tracks it, from its declaration on: what t gives
// the body, plus the bookkeeping its parent and the run need.
interface Context extends declared.TAL.TestContext {
    node: TestNode
    nesting: number
    testNumber: number
    // The chain a result below this test announces first: the suites and
    // tests above it, then itself.
    chain: Ancestor[]
    skipped: string | true | undefined
    pending: Promise<Outcome>[]
    // The tail of the subtest chain and how many are still running: node:test
    // runs subtests one at a time, so a new one waits for the previous one
    // whether awaited or not, but the first starts right away, synchronously.
    last: Promise<unknown>
    active: number
    subtests: number
    // Every subtest declared so far, in order, so a parent giving up can
    // close the ones that have not reported yet.
    children: Context[]
    // The verdict is decided, by this test or by the parent giving up on it.
    // Set before the first reporter await, so nothing the body does while
    // the verdict is being reported can reopen it.
    finished: boolean
    started: boolean
    startedAt: number
    // The failure a late subtest carries from the start.
    late: TesterError | undefined
}

const makeContext = (state: RunState, node: TestNode, nesting: number, testNumber: number, above: Ancestor[]): Context => {
    const context: Context = {
        node,
        nesting,
        testNumber,
        chain: [...above, {name: node.name, nesting, announced: false}],
        name: node.name,
        assert: state.assert,
        skipped: undefined,
        pending: [],
        last: Promise.resolve(),
        active: 0,
        subtests: 0,
        children: [],
        finished: false,
        started: false,
        startedAt: 0,
        late: undefined,
        skip: (message) => {
            // As in node:test the body is not interrupted; only the verdict
            // changes, and a verdict already out stays as it is.
            if (context.finished) return
            context.skipped = message ?? true
        },
        diagnostic: (message) => {
            // node:test keeps diagnostics for the report; one arriving after
            // the report has no place to go.
            if (context.finished) return
            void state.reporter.emit("test:diagnostic", {message, nesting, level: "info"})
        },
        test: (...args: Args<TestFn>) => {
            const parsed = normalize<TestFn>(args)
            const node: TestNode = {
                kind: "test", name: nameOf(parsed.name, parsed.fn),
                options: parsed.options, fn: parsed.fn,
            }
            if (context.finished) return lateTest(state, node)

            const child = makeContext(state, node, nesting + 1, ++context.subtests, context.chain)
            context.children.push(child)
            // Started here when nothing else is running, so the body reaches
            // its first await before t.test() returns, as in node:test.
            const start = (): Promise<Outcome> => runContext(state, child).finally(() => {
                context.active--
            })
            context.active++
            const promise = context.active === 1 ? start() : context.last.then(start)
            context.last = promise
            context.pending.push(promise)

            // A subtest its parent gave up on before it could start never
            // resumes the caller in node:test. Rejecting comes closest without
            // leaving a body hanging, and the run holds a handler for it, so
            // an unawaited call does not surface as an unhandled rejection.
            const settled = promise.then(() => {
                if (!child.started) throw cancelledByParent()
            })
            settled.catch(() => undefined)
            return settled
        },
    }
    return context
}

// Queues a subtest declared after its parent was reported. The number is
// taken now, the run reports it once the registered tests are done.
const lateTest = (state: RunState, node: TestNode): Promise<void> => {
    if (state.closed) return Promise.resolve()
    const testNumber = state.harness.rootSuite.children.length + ++state.lateCount
    const context = makeContext(state, node, 0, testNumber, [])
    context.late = parentAlreadyFinished()
    return new Promise((resolve) => {
        state.late.push({context, resolve})
        state.wake?.()
    })
}

// Keeps a promise until it settles, whichever way.
const linger = (state: RunState, promise: Promise<unknown>): void => {
    state.lingering.add(promise)
    promise.finally(() => state.lingering.delete(promise)).catch(() => undefined)
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

// Closes every subtest below a test that gave up, deepest first and in
// declaration order, and counts them right away. Reporting comes after,
// so a body resuming while the reporter is busy already finds them closed.
const closeDescendants = (state: RunState, context: Context): Context[] => {
    const {counters} = state
    const closed: Context[] = []
    const close = (parent: Context): void => {
        for (const child of parent.children) {
            if (child.finished) continue
            child.finished = true
            close(child)
            if (!child.started) counters.tests++
            if (skipOfContext(child) != null) counters.skipped++
            else counters.cancelled++
            closed.push(child)
        }
    }
    close(context)
    if (closed.length) state.success = false
    return closed
}

// A skip the body called outranks the one it was declared with.
const skipOfContext = (context: Context): string | true | undefined => context.skipped ?? skipOf(context.node)

const reportCancelled = async (state: RunState, closed: Context[]): Promise<void> => {
    for (const child of closed) {
        const skip = skipOfContext(child)
        await announceChain(state, child.chain)
        await state.reporter.emit("test:fail", {
            name: child.node.name, nesting: child.nesting, testNumber: child.testNumber,
            ...(skip != null ? {skip} : {}),
            details: {
                duration_ms: child.started ? performance.now() - child.startedAt : 0,
                type: "test", error: cancelledByParent(),
            },
        })
    }
}

export const runTest = (state: RunState, node: TestNode, nesting: number, testNumber: number): Promise<Outcome> =>
    runContext(state, makeContext(state, node, nesting, testNumber, state.ancestors))

const runContext = async (state: RunState, context: Context): Promise<Outcome> => {
    // Closed by the parent while still queued: the parent reported it.
    if (context.finished) return "cancelled"

    const {counters} = state
    const {node, nesting, testNumber, late} = context
    const skip = skipOf(node)

    context.started = true
    context.startedAt = performance.now()
    counters.tests++

    if (skip != null || node.fn == null) {
        // Decided before the reporter is awaited, so a parent giving up in
        // the meantime does not report this one a second time.
        context.finished = true
        if (late != null) {
            if (skip != null) counters.skipped++
            else counters.failed++
            state.success = false
            await announceChain(state, context.chain)
            await state.reporter.emit("test:fail", {
                name: node.name, nesting, testNumber,
                ...(skip != null ? {skip} : {}),
                details: {duration_ms: 0, type: "test", error: late},
            })
            return "failed"
        }
        if (skip != null) counters.skipped++
        else counters.passed++
        await announceChain(state, context.chain)
        await state.reporter.emit("test:pass", {
            name: node.name, nesting, testNumber,
            ...(skip != null ? {skip} : {}),
            details: {duration_ms: performance.now() - context.startedAt, type: "test"},
        })
        return skip != null ? "skipped" : "passed"
    }

    const wasInTestBody = state.harness.inTestBody
    state.harness.inTestBody = true
    // While the body runs this test is an ancestor of its subtests, so a
    // subtest's result announces it first, as node:test orders the starts.
    const outer = state.ancestors
    state.ancestors = context.chain

    let error: Error | undefined
    let timedOut = false
    let failedSubtests = 0
    let closed: Context[] = []
    try {
        const {timeout} = node.options
        const body = Promise.resolve(node.fn(context))
        if (timeout != null && timeout > 0) {
            const timer = timeoutAfter(timeout)
            try {
                await Promise.race([body, timer.promise])
            } catch (e) {
                if (e === timer.error) {
                    // The verdict is out from this point: the body keeps
                    // running, but what it does no longer counts for this test,
                    // and the run waits for it and the subtests in flight.
                    timedOut = true
                    context.finished = true
                    closed = closeDescendants(state, context)
                    for (const promise of [body, ...context.pending]) linger(state, promise)
                }
                throw e
            } finally {
                timer.cancel()
            }
        } else {
            await body
        }
        // An unawaited t.test() is still finished rather than dropped, which
        // is where node:test gives up on it.
        while (context.pending.length && !context.finished) {
            const outcome = await context.pending.shift()
            if (outcome === "failed" || outcome === "cancelled") failedSubtests++
        }
    } catch (e) {
        error = testRunnerError(e, "testCodeFailure")
    } finally {
        state.harness.inTestBody = wasInTestBody
        state.ancestors = outer
    }

    // The parent gave up on this test while it ran and has reported it.
    if (context.finished && !timedOut) return "cancelled"
    context.finished = true

    // A parent whose subtest failed fails in turn, as in node:test.
    if (error == null && failedSubtests) {
        error = new TesterError(`${failedSubtests} subtest${failedSubtests === 1 ? "" : "s"} failed`, "subtestsFailed")
    }
    // A late subtest keeps the failure it started with, whatever happened.
    if (late != null) error = late

    const duration_ms = performance.now() - context.startedAt
    await reportCancelled(state, closed)
    await announceChain(state, context.chain)
    const runtimeSkip = context.skipped

    if (error != null) {
        // A skip called from the body outranks the failure in the count, as
        // it does in node:test, and a timeout files under cancelled. The
        // outcome still tells the parent about the failure.
        if (runtimeSkip != null) counters.skipped++
        else if (timedOut && late == null) counters.cancelled++
        else counters.failed++
        state.success = false
        await state.reporter.emit("test:fail", {
            name: node.name, nesting, testNumber,
            ...(runtimeSkip != null ? {skip: runtimeSkip} : {}),
            details: {duration_ms, type: "test", error},
        })
        return timedOut && late == null ? "cancelled" : "failed"
    }

    if (runtimeSkip != null) counters.skipped++
    else counters.passed++

    await state.reporter.emit("test:pass", {
        name: node.name, nesting, testNumber,
        ...(runtimeSkip != null ? {skip: runtimeSkip} : {}),
        details: {duration_ms, type: "test"},
    })
    return runtimeSkip != null ? "skipped" : "passed"
}

// Runs what the walk left behind: the late subtests, in the order they were
// declared, and the bodies still running. A body may be waiting on a late
// subtest of its own, so waiting on the bodies stops as soon as one arrives.
export const drainLate = async (state: RunState): Promise<void> => {
    for (;;) {
        while (state.late.length) {
            const {context, resolve} = state.late.shift()!
            await runContext(state, context)
            resolve()
        }
        if (!state.lingering.size) break
        await new Promise<void>((resolve) => {
            state.wake = resolve
            void Promise.allSettled([...state.lingering]).then(() => resolve())
        })
        state.wake = undefined
    }
    state.closed = true
}
