import type * as declared from "test-assert-lite"
import {cancelledByParent, TesterError, testRunnerError} from "./common/tester-error.ts"
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
    // Bodies that outlived their timeout. node:test reports the timeout at
    // once but ends the run only when they settle, and so does run() here.
    lingering: Promise<unknown>[]
    // How many children the root has numbered so far. A subtest started
    // after its parent finished is numbered as the root's next child, and
    // reported once the registered ones all are, as node:test orders it.
    topLevel: number
    lateReports: (() => Promise<void>)[]
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

// A subtest as its parent tracks it. When the parent times out, node:test
// reports every child still in flight as cancelled at once, and the child's
// own verdict, whenever its body settles, is no longer reported.
interface Child {
    name: string
    nesting: number
    testNumber: number
    started: boolean
    reported: boolean
    // A queued child marked skip keeps its skip when the parent gives up.
    skip: string | true | undefined
    // The child's own entry among the ancestors once its body runs, so a
    // cancellation announces it once rather than twice.
    ancestor?: Ancestor
}

interface Context extends declared.TAL.TestContext {
    skipped: string | true | undefined
    // Set once the test has been reported. What the body does after that
    // is late: node:test drops a diagnostic and fails a subtest.
    finished: boolean
    pending: Promise<Outcome>[]
    children: Child[]
    // The tail of the subtest chain and how many are still running: node:test
    // runs subtests one at a time, so a new one waits for the previous one
    // whether awaited or not, but the first starts right away, synchronously.
    last: Promise<unknown>
    active: number
    subtests: number
}

const makeContext = (state: RunState, name: string, nesting: number, asChild?: Child): Context => {
    const context: Context = {
        name,
        assert: state.assert,
        skipped: undefined,
        finished: false,
        pending: [],
        children: [],
        last: Promise.resolve(),
        active: 0,
        subtests: 0,
        skip: (message) => {
            // Already decided: a parent's timeout, for one, must not be
            // reopened by a skip the body only gets to call afterwards.
            if (context.finished) return
            // As in node:test the body is not interrupted; only the verdict changes.
            context.skipped = message ?? true
            // A parent cancelling this test while it is still running reads
            // this, not the options it was declared with.
            if (asChild != null) asChild.skip = context.skipped
        },
        diagnostic: (message) => {
            if (context.finished) return
            void state.reporter.emit("test:diagnostic", {message, nesting, level: "info"})
        },
        test: async (...args: Args<TestFn>) => {
            const parsed = normalize<TestFn>(args)
            const node: TestNode = {
                kind: "test", name: nameOf(parsed.name, parsed.fn),
                options: parsed.options, fn: parsed.fn,
            }
            if (context.finished) {
                const promise = lateTest(state, node)
                state.lingering.push(promise)
                await promise
                return
            }
            const testNumber = ++context.subtests
            const child: Child = {name: node.name, nesting: nesting + 1, testNumber, started: false, reported: false, skip: skipOf(node)}
            context.children.push(child)
            // Started here when nothing else is running, so the body reaches
            // its first await before t.test() returns, as in node:test.
            const start = (): Promise<Outcome> => runTest(state, node, nesting + 1, testNumber, child).finally(() => {
                context.active--
                context.children.splice(context.children.indexOf(child), 1)
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

// A subtest started after its parent was reported. node:test still runs
// the body unless it is skipped, and files the test as a top-level failure
// of its own kind once every registered test has been reported.
const lateTest = async (state: RunState, node: TestNode): Promise<void> => {
    const {counters} = state
    const registeredSkip = skipOf(node)
    counters.tests++
    state.success = false
    const started = performance.now()
    let runtimeSkip: string | true | undefined
    if (registeredSkip == null) {
        const context = makeContext(state, node.name, 0)
        try {
            await node.fn?.(context)
        } catch {
            // the verdict is already decided
        }
        // Subtests it started and did not await settle before the summary too.
        state.lingering.push(...context.pending)
        runtimeSkip = context.skipped
    }
    // The body's own t.skip() decides this as much as how it was declared.
    const skip = registeredSkip ?? runtimeSkip
    if (skip != null) counters.skipped++
    else counters.failed++
    const duration_ms = performance.now() - started
    state.lateReports.push(async () => {
        const error = new TesterError("test could not be started because its parent finished", "parentAlreadyFinished")
        await state.reporter.emit("test:start", {name: node.name, nesting: 0})
        await state.reporter.emit("test:fail", {
            name: node.name, nesting: 0, testNumber: ++state.topLevel,
            ...(skip != null ? {skip} : {}),
            details: {duration_ms, type: "test", error},
        })
    })
}

// Reports the children a timed-out parent leaves in flight as cancelled,
// before the parent itself. One not yet started is counted here; one that
// is running was counted when it started, and skips its own report later.
const cancelChildren = async (state: RunState, context: Context): Promise<void> => {
    // A snapshot: a child settling while the reporter is awaited removes
    // itself from the live list, which would shift its siblings past the loop.
    for (const child of [...context.children]) {
        if (child.reported) continue
        child.reported = true
        if (!child.started) state.counters.tests++
        // A queued child marked skip is counted as skipped, as node:test does.
        if (child.skip != null) state.counters.skipped++
        else state.counters.cancelled++
        state.success = false
        await announce(state, child.ancestor ?? {name: child.name, nesting: child.nesting, announced: false})
        await state.reporter.emit("test:fail", {
            name: child.name, nesting: child.nesting, testNumber: child.testNumber,
            ...(child.skip != null ? {skip: child.skip} : {}),
            details: {duration_ms: 0, type: "test", error: cancelledByParent()},
        })
    }
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

export const runTest = async (state: RunState, node: TestNode, nesting: number, testNumber: number, asChild?: Child): Promise<Outcome> => {
    const {counters} = state
    const skip = node.options.skip
    const skipped = skip === true || "string" === typeof skip

    // Already reported as cancelled by the parent's timeout while queued.
    if (asChild?.reported) return "cancelled"
    counters.tests++
    const started = performance.now()
    const self: Ancestor = {name: node.name, nesting, announced: false}
    if (asChild != null) {
        asChild.started = true
        asChild.ancestor = self
    }

    if (skipped || node.fn == null) {
        // The verdict is already decided; nothing here can still be running
        // for a concurrent parent timeout to race against.
        if (asChild != null) asChild.reported = true
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

    const context = makeContext(state, node.name, nesting, asChild)
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
                // The body goes on; the run ends only once it has settled.
                if (timedOut) {
                    // Set before the cancellation is reported, so a t.test()
                    // the body calls while that report is pending is already
                    // late rather than an ordinary nested subtest.
                    context.finished = true
                    state.lingering.push(body, ...context.pending)
                    await cancelChildren(state, context)
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
        while (context.pending.length) {
            const outcome = await context.pending.shift()
            if (outcome === "failed" || outcome === "cancelled") failedSubtests++
        }
    } catch (e) {
        error = testRunnerError(e, "testCodeFailure")
    } finally {
        state.harness.inTestBody = wasInTestBody
        state.ancestors = outer
    }

    // A parent whose subtest failed fails in turn, as in node:test.
    if (error == null && failedSubtests) {
        error = new TesterError(`${failedSubtests} subtest${failedSubtests === 1 ? "" : "s"} failed`, "subtestsFailed")
    }

    // Finished before the reporter is awaited, so a body resuming while the
    // output is slow already sees itself as reported.
    context.finished = true
    const duration_ms = performance.now() - started

    // The parent's timeout already reported this test as cancelled.
    if (asChild?.reported) return "cancelled"
    if (asChild != null) asChild.reported = true

    await announce(state, self)
    const runtimeSkip = context.skipped

    if (error != null) {
        // A skip called from the body outranks the failure in the count, as
        // it does in node:test, and a timeout files under cancelled. The
        // outcome still tells the parent about the failure.
        if (runtimeSkip != null) counters.skipped++
        else if (timedOut) counters.cancelled++
        else counters.failed++
        state.success = false
        await state.reporter.emit("test:fail", {
            name: node.name, nesting, testNumber,
            ...(runtimeSkip != null ? {skip: runtimeSkip} : {}),
            details: {duration_ms, type: "test", error},
        })
        return timedOut ? "cancelled" : "failed"
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
