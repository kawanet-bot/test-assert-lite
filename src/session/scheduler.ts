import type {TAL} from "test-assert-lite"
import type {Run} from "../suite/job.ts"
import {ReportStream} from "./report-stream.ts"
import type {Open, SessionControl} from "./session.ts"
import type {HarnessState} from "./state.ts"
import {resetHarnessState} from "./state.ts"

// One cycle of the harness: from the first declaration to the end() that
// reports it. The tests are held until end() lets them go, so a suite
// still loading cannot declare into one already running.
interface Cycle {
    run: Run
    session: Open
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
    end: TAL.SessionAPI["end"]
}

export const createScheduler = (
    harness: HarnessState,
    sessions: SessionControl,
    assert: TAL.TestContextAssert,
): Scheduler => {
    let cycle: Cycle | null = null
    let running = false

    const open = (): Cycle => {
        const session = sessions.open()
        const stream = new ReportStream()
        const run: Run = {
            counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0},
            success: true,
            emit: (type, data) => stream.emit({type, data} as TAL.TestEvent),
            assert,
            closed: false,
        }
        return {run, session, stream, startedAt: performance.now(), held: true, walk: null, closing: false, failure: undefined}
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

    // Runs what is left, ends the root and reports the summary. The verdict
    // is what the run came to, and a failure on the way is thrown.
    const conclude = async (current: Cycle): Promise<TAL.SessionResult> => {
        while (current.walk != null) await current.walk
        if (current.failure != null) throw current.failure.error
        // Hooks declared since the last walk, or with no test at all.
        await harness.root.walk(current.run)
        // The root's teardown, then the summary: the root has no result
        // of its own, so the summary is what stands for it.
        await harness.root.end()
        const summary = summaryOf(current)
        await current.run.emit("test:summary", summary)
        return {success: summary.success}
    }

    // The outcome settles the services, a failure included. The CLI hears
    // the verdict once the cleanups are through, and the harness is reset.
    const end: TAL.SessionAPI["end"] = async () => {
        if (running) throw new Error("end() is already running")
        running = true
        // An empty run still reports, and root hooks alone still run.
        const current = cycle ??= open()
        current.held = false
        schedule()
        current.closing = true
        const {services, report, reporter, output} = current.session
        current.stream.attach(reporter, output)
        // The stream closes either way, so the reporter writes all it was given.
        try {
            services.resolve(await conclude(current).finally(() => current.stream.close()))
        } catch (error) {
            services.reject(error)
        }
        await services.finished.then(report, () => report({success: false}))
        // A partially executed registry is unsafe to retry.
        resetHarnessState(harness)
        cycle = null
        running = false
        return await services.finished
    }

    return {schedule, end}
}

// What the run came to: the counts, the time and the verdict.
const summaryOf = ({run, startedAt}: Cycle): TAL.TestSummary => ({
    counts: {...run.counters},
    duration_ms: performance.now() - startedAt,
    success: run.success,
})
