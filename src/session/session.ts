// The sessions of one harness, one cycle each: what the run reports with,
// where its console goes, the walk of the tests declared, and the run()
// that reports the verdict and lets go of what was taken.

import type {TAL} from "test-assert-lite"
import type {Run} from "../suite/job.ts"
import {hasProcess} from "../utils/process.ts"
import {createRunServices, type RunServices} from "../utils/run-services.ts"
import {stringify} from "../utils/stringify.ts"
import {defaultBridge, heartbeatBridge} from "./client.ts"
import {consoleWriters, saveConsole, takeConsole} from "./console.ts"
import {nodeBridge} from "./node-bridge.ts"
import type {ReportStream} from "./report-stream.ts"
import {createReportStream} from "./report-stream.ts"
import {chooseReporter} from "./reporters.ts"
import type {HarnessState} from "./state.ts"
import {resetHarnessState} from "./state.ts"
import {takeUncaught} from "./uncaught.ts"

type SessionResult = TAL.SessionResult

// One cycle of the harness: from session(), or the first declaration, to
// the run() that reports it. The tests are held until run() lets them go,
// so a suite still loading cannot declare into one already running.
interface Cycle {
    services: RunServices
    // What the run's events go through, on the way to the reporter.
    report: ReportStream
    // Tells the CLI the verdict. Without a bridge there is nothing to tell.
    close: (result: SessionResult) => Promise<void>
    // Opened by a declaration rather than by session(): the refusal differs.
    auto: boolean
    run: Run
    startedAt: number
    held: boolean
    // The walk under way, or null while idle between declarations.
    walk: Promise<void> | null
    // run() is closing the cycle and drives the rest itself.
    closing: boolean
    // What the walk failed with, kept for run() to reject with.
    failure: {error: unknown} | undefined
}

export interface Sessions {
    session: TAL.SessionAPI["session"]
    run: TAL.SessionAPI["run"]
    // Called on a declaration at the root. It starts the walk once run() has
    // let it, unless one is under way.
    schedule: () => void
}

export const createSessions = (harness: HarnessState, assert: TAL.TestContextAssert): Sessions => {
    let cycle: Cycle | null = null

    const open = (options: TAL.SessionOptions, auto: boolean): Cycle => {
        const {heartbeat} = options
        const reporter = chooseReporter(harness, options)
        // Saved before anything is taken over, so nothing here loops back.
        const found = options.console ?? globalThis.console
        const saved = saveConsole(found)
        // The run's text and verdict go to the CLI over the bridge given, to
        // the process under Node, or to the console as found. A heartbeat of 0
        // turns the alive line off.
        // A session nobody opened, or a run nobody called, has no reader for
        // the verdict in the process. The bridge turns it into the exit code.
        let unattended = auto
        const bridge = options.bridge ?? (hasProcess() ? nodeBridge(process, () => unattended) : defaultBridge(consoleWriters(found, saved)))
        const client = (heartbeat == null || heartbeat > 0) ? heartbeatBridge(bridge, heartbeat) : bridge
        const services = createRunServices(client)
        // The report goes where the console goes unless told otherwise.
        const output = options.output ?? ((text: string) => services.stdout.write(text))
        // Taken before the reporter starts, since it refuses what is not a window or a process.
        const releaseUncaught = options.uncaught == null ? null : takeUncaught(harness, options.uncaught)
        // Registered first, so the report closes before the writers disconnect.
        const report = createReportStream({reporter, output, services})
        if (releaseUncaught != null) services.onCleanup(releaseUncaught)
        if (options.console) services.onCleanup(takeConsole(found, saved, services.stdout, services.stderr))

        const state: Run = {
            counters: {tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0},
            success: true,
            emit: (type, data) => report.write({type, data} as TAL.TestEvent),
            assert,
            closed: false,
        }

        const showError = (err: Error | null) => void (err && services.stderr.write(`${stringify(err)}\n`))

        client.send({type: "session:begin"}, showError)

        const close: Cycle["close"] = (data) => {
            return new Promise<void>((resolve, reject) => {
                client.send({type: "session:end", data}, (err) => (err ? reject(err) : resolve()))
            }).catch(showError).finally(() => client.disconnect())
        }

        // Node's own runner ends the run as the process would exit. Here too.
        // A run() already under way, or done, leaves nothing for this to do.
        const onExit = (): void => {
            if (cycle == null || cycle.closing) return
            unattended = true
            run().catch(showError)
        }

        // A suite run as a script under Node needs no run(). The loop draining is its end.
        if (hasProcess()) {
            process.once("beforeExit", onExit)
            services.onCleanup(() => process.off("beforeExit", onExit))
        }

        return {services, report, close, auto, run: state, startedAt: performance.now(), held: true, walk: null, closing: false, failure: undefined}
    }

    const session: TAL.SessionAPI["session"] = (options = {}) => {
        if (cycle != null) {
            throw new Error(cycle.auto ? "session() must come before the first test is declared" : "session() is already open")
        }
        cycle = open(options, false)
    }

    // A walk that ends picks up what was declared while it wound down.
    const schedule = (): void => {
        const current = cycle ??= open({}, true)
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
    const conclude = async (current: Cycle): Promise<SessionResult> => {
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
    const run: TAL.SessionAPI["run"] = async () => {
        if (cycle?.closing) throw new Error("run() is already running")
        // An empty run still reports, and root hooks alone still run.
        const current = cycle ??= open({}, true)
        current.held = false
        schedule()
        current.closing = true
        const {services, close} = current
        try {
            services.resolve(await conclude(current))
        } catch (error) {
            services.reject(error)
        }
        await services.finished.then(close, () => close({success: false}))
        // A partially executed registry is unsafe to retry.
        resetHarnessState(harness)
        cycle = null
        return await services.finished
    }

    return {session, run, schedule}
}

// What the run came to: the counts, the time and the verdict.
const summaryOf = ({run, startedAt}: Cycle): TAL.TestSummary => ({
    counts: {...run.counters},
    duration_ms: performance.now() - startedAt,
    success: run.success,
})
