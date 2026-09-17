import type * as declared from "test-assert-lite"
import type {Run} from "../suite/job.ts"
import {ReportStream} from "./report-stream.ts"
import type {SessionControl} from "./session.ts"
import type {HarnessState} from "./state.ts"
import {resetHarnessState} from "./state.ts"

// One cycle of the harness: from the first declaration to the end() that
// reports it. The tests are held until end() lets them go, so a suite
// still loading cannot declare into one already running.
interface Cycle {
    run: Run
    stream: ReportStream
    startedAt: number
    held: boolean
    // The walk under way, or null while idle between declarations.
    walk: Promise<void> | null
    // end() is closing the cycle and drives the rest itself.
    closing: boolean
    // What the walk failed with, kept for end() to reject with.
    failure: {error: unknown} | undefined
}

export interface Scheduler {
    // Called on a declaration at the root: starts the walk, once end() has
    // let it, unless one is under way.
    schedule: () => void
    end: declared.TAL.SessionAPI["end"]
}

export const createScheduler = (
    harness: HarnessState,
    sessions: SessionControl,
    assert: declared.TAL.TestContextAssert,
): Scheduler => {
    let cycle: Cycle | null = null
    let running = false

    const open = (): Cycle => {
        sessions.open()
        const stream = new ReportStream()
        const run: Run = {
            counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0},
            success: true,
            emit: (type, data) => stream.emit({type, data} as declared.TAL.TestEvent),
            assert,
            closed: false,
        }
        return {run, stream, startedAt: performance.now(), held: true, walk: null, closing: false, failure: undefined}
    }

    // A walk that ends picks up what was declared while it wound down.
    const schedule = (): void => {
        const current = cycle ??= open()
        if (current.held || current.walk != null || current.closing || current.failure != null) return
        current.walk = new Promise<void>(resolve => queueMicrotask(resolve))
            .then(() => harness.root.walk(current.run))
            .catch(error => {
                current.failure = {error}
            })
            .finally(() => {
                current.walk = null
                if (harness.root.hasPendingChildren) schedule()
            })
    }

    // Waits for the tests, reports, closes the session with the verdict, and
    // resets; a failure on the way still tells the session the run failed.
    const end: declared.TAL.SessionAPI["end"] = async () => {
        if (running) throw new Error("end() is already running")
        running = true
        // An empty run still reports, and root hooks alone still run.
        const current = cycle ??= open()
        current.held = false
        schedule()
        current.closing = true

        let result: declared.TAL.TestSummary | undefined
        let failed = false
        let failure: unknown
        try {
            sessions.attach(current.stream)
            while (current.walk != null) await current.walk
            if (current.failure != null) throw current.failure.error
            // Hooks declared since the last walk, or with no test at all.
            await harness.root.walk(current.run)
            // The root's teardown, then the summary: the root has no result
            // of its own, so the summary is what stands for it.
            await harness.root.end()
            result = summaryOf(current)
            await current.run.emit("test:summary", result)
        } catch (error) {
            failed = true
            failure = error
        }

        try {
            await current.stream.close()
        } catch (error) {
            if (!failed) {
                failed = true
                failure = error
            }
        }

        try {
            await sessions.close(!failed && result!.success)
        } catch (error) {
            if (!failed) {
                failed = true
                failure = error
            }
        } finally {
            // A partially executed registry is unsafe to retry.
            resetHarnessState(harness)
            cycle = null
            running = false
        }

        if (failed) throw failure
        return {success: result!.success}
    }

    return {schedule, end}
}

// What the run came to: the counts, the time and the verdict.
const summaryOf = ({run, startedAt}: Cycle): declared.TAL.TestSummary => ({
    counts: {...run.counters},
    duration_ms: performance.now() - startedAt,
    success: run.success,
})
