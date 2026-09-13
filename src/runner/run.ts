import type * as declared from "test-assert-lite"
import type {ReporterControl} from "../reporter.ts"
import type {ReportStream} from "../reporter/report-stream.ts"
import {VERSION} from "../utils/version.ts"
import type {HarnessState} from "./suite.ts"
import {resetHarnessState} from "./suite.ts"
import type {Run} from "./tester.ts"

// One cycle of the harness: from the first declaration to the run() that
// reports it. The tests start on their own, a microtask after they are
// declared, as they do under node:test; run() waits for them.
interface Cycle {
    run: Run
    stream: ReportStream
    startedAt: number
    // The walk under way, or null while idle between declarations.
    walk: Promise<void> | null
    // The root's setup ran, so a walk goes straight to the children.
    started: boolean
    // run() is closing the cycle and drives the rest itself.
    closing: boolean
    // What the walk failed with, kept for run() to reject with.
    failure: {error: unknown} | undefined
}

export interface Scheduler {
    // Called on a declaration at the root: starts the walk unless one runs.
    schedule: () => void
    run: typeof declared.run
}

export const createScheduler = (
    harness: HarnessState,
    control: ReporterControl,
    assert: declared.TAL.AssertMethods,
): Scheduler => {
    let cycle: Cycle | null = null
    let running = false

    const open = (): Cycle => {
        const stream = control.open()
        const run: Run = {
            counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0},
            success: true,
            emit: (type, data) => stream.emit({type, data} as declared.TAL.TestEvent),
            assert,
            harness,
            closed: false,
        }
        return {run, stream, startedAt: performance.now(), walk: null, started: false, closing: false, failure: undefined}
    }

    // The root's setup once, then the children declared so far. A walk
    // that ends picks up what was declared while it wound down.
    const walk = async (current: Cycle): Promise<void> => {
        const {root} = harness
        if (!current.started) {
            current.started = true
            await root.startRoot(current.run)
        }
        await root.runRootChildren()
    }

    const schedule = (): void => {
        const current = cycle ??= open()
        if (current.walk != null || current.closing || current.failure != null) return
        current.walk = new Promise<void>(resolve => queueMicrotask(resolve))
            .then(() => walk(current))
            .catch(error => {
                current.failure = {error}
            })
            .finally(() => {
                current.walk = null
                if (harness.root.hasPendingChildren) schedule()
            })
    }

    const run: typeof declared.run = async () => {
        if (running) throw new Error("run() is already running")
        running = true
        // An empty run still reports, and root hooks alone still run.
        const current = cycle ??= open()
        current.closing = true

        let result: declared.TAL.TestSummary | undefined
        let failed = false
        let failure: unknown
        try {
            // The reporter takes the settings as they are now, and what
            // the tests reported so far goes out ahead of the rest.
            control.attach(current.stream)
            while (current.walk != null) await current.walk
            if (current.failure != null) throw current.failure.error
            if (!current.started) await walk(current)
            result = await finish(current)
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
        } finally {
            // A partially executed registry is unsafe to retry. Configuration
            // lives outside the per-run ReportStream and remains installed.
            resetHarnessState(harness)
            cycle = null
            running = false
        }

        if (failed) throw failure
        return result!
    }

    return {schedule, run}
}

// The root's teardown, then the summary. The root has no result of its
// own, so the summary is what stands for it.
const finish = async (current: Cycle): Promise<declared.TAL.TestSummary> => {
    const {run} = current
    await run.harness.root.finishRoot()

    const duration_ms = performance.now() - current.startedAt
    const summary: declared.TAL.TestSummary = {
        counts: {...run.counters},
        duration_ms,
        success: run.success,
    }

    // node:test's summary, then what node:test never says: which package
    // ran the suites, and where, as the browser or Node names itself.
    const userAgent = globalThis.navigator?.userAgent
    for (const [label, value] of [
        ["tests", run.counters.tests],
        ["suites", run.counters.suites],
        ["pass", run.counters.passed],
        ["fail", run.counters.failed],
        ["cancelled", run.counters.cancelled],
        ["skipped", run.counters.skipped],
        ["todo", run.counters.todo],
        ["duration_ms", duration_ms],
        ["test-assert-lite", VERSION],
        ...(userAgent == null ? [] : [["user-agent", userAgent]]),
    ] as [string, number | string][]) {
        await run.emit("test:diagnostic", {
            message: `${label} ${value}`, nesting: 0, level: "info",
        })
    }

    await run.emit("test:summary", summary)
    return summary
}
