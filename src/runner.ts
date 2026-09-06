import type * as declared from "test-assert-lite"
import type {ReporterControl} from "./reporter.ts"
import type {HarnessState} from "./suite.ts"
import {resetHarnessState} from "./suite.ts"
import type {Run} from "./tester.ts"

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
            // lives outside the per-run ReportStream and remains installed.
            resetHarnessState(harness)
            running = false
        }

        if (failed) throw failure
        return result!
    }
}

// The root runs like any suite: its children in order, then whatever a
// timed out body declared afterwards. It has no result of its own, so the
// summary is what stands for it.
const runOnce = async (
    harness: HarnessState,
    control: ReporterControl,
    assert: declared.TAL.AssertMethods,
): Promise<declared.TAL.TestSummary> => {
    const started = performance.now()
    const run: Run = {
        counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0},
        success: true,
        reporter: control.reporter,
        assert,
        harness,
        lingering: new Set(),
        wake: undefined,
        closed: false,
    }

    await harness.root.start(run)

    const duration_ms = performance.now() - started
    const summary: declared.TAL.TestSummary = {
        counts: {...run.counters},
        duration_ms,
        success: run.success,
    }

    for (const [label, value] of [
        ["tests", run.counters.tests],
        ["suites", run.counters.suites],
        ["pass", run.counters.passed],
        ["fail", run.counters.failed],
        ["cancelled", run.counters.cancelled],
        ["skipped", run.counters.skipped],
        ["duration_ms", duration_ms],
    ] as [string, number][]) {
        await run.reporter.emit("test:diagnostic", {
            message: `${label} ${value}`, nesting: 0, level: "info",
        })
    }

    await run.reporter.emit("test:summary", summary)
    return summary
}
