// The sessions of one harness, one cycle each: what the run reports with,
// where its console goes, the walk of the tests declared, and the run()
// that reports the verdict and lets go of what was taken.

import type {TAL} from "test-assert-lite"
import {withHeartbeat} from "../process/fetch-channel.ts"
import {sessionChannel} from "../process/proc.ts"
import type {Run} from "../suite/job.ts"
import {hasProcess} from "../utils/process.ts"
import {createRunServices, type RunServices} from "../utils/run-services.ts"
import {stringify} from "../utils/stringify.ts"
import {saveConsole, takeConsole} from "./console.ts"
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
    // The stream the run's events go through, on the way to the reporter.
    report: ReportStream
    // The destination of the run's text and verdict, let go of once the verdict is out.
    channel: TAL.Channel
    // Names the session to the host, among others on the same channel.
    id: string
    run: Run
    startedAt: number
    held: boolean
    // The walk under way, or null while idle between declarations.
    walk: Promise<void> | null
    // run() is closing the cycle and drives the rest itself.
    closing: boolean
    // The walk's failure, kept for run() to reject with.
    failure: {error: unknown} | undefined
}

export interface Sessions {
    session: TAL.SessionAPI["session"]
    run: TAL.SessionAPI["run"]
    load: TAL.SessionAPI["load"]
    // Called on a declaration at the root. It starts the walk once run() has
    // let it, unless one is under way.
    schedule: () => void
}

// Nine base-36 characters, like the run's own path. Unique among the
// sessions of one page is all it has to be.
const sessionId = (): string => Math.floor(Math.random() * 36 ** 9).toString(36).padStart(9, "0")

export const createSessions = (harness: HarnessState, assert: TAL.TestContextAssert): Sessions => {
    let cycle: Cycle | null = null

    const open = (options: TAL.SessionOptions, implicitSession: boolean): Cycle => {
        const {heartbeat} = options
        const reporter = chooseReporter(harness, options)
        // Saved before anything is taken over, so nothing here loops back.
        const found = options.console ?? globalThis.console
        const saved = saveConsole(found)
        // The run's text and verdict go to the host over the channel given, or
        // over the realm's. A heartbeat of 0 turns the alive line off.
        const given = options.channel ?? sessionChannel(implicitSession)
        const channel = (heartbeat == null || heartbeat > 0) ? withHeartbeat(given, heartbeat) : given
        const services = createRunServices(channel)
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

        // A word out as the session opens. Nothing waits for it, so session() stays synchronous.
        const id = sessionId()
        channel.send({type: "session:begin", session: id}, showError)

        // Node's own runner ends the run as the process would exit. Here too.
        // A run() already under way, or done, leaves nothing for this to do.
        const onExit = (): void => {
            if (cycle == null || cycle.closing) return
            run().catch(showError)
        }

        // A suite run as a script under Node needs no run(). The loop draining
        // is its end. A session opened by session() is run by whoever opened it.
        if (hasProcess() && implicitSession) {
            process.once("beforeExit", onExit)
            services.onCleanup(() => process.off("beforeExit", onExit))
        }

        return {services, report, channel, id, run: state, startedAt: performance.now(), held: true, walk: null, closing: false, failure: undefined}
    }

    const session: TAL.SessionAPI["session"] = (options = {}) => {
        if (cycle != null) {
            throw new Error("session() is already open. It comes before the first test is declared.")
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

    // The outcome settles the services, a failure included. The host hears
    // the verdict once the cleanups are through, and the harness is reset.
    const run: TAL.SessionAPI["run"] = async () => {
        if (cycle?.closing) throw new Error("run() is already running")
        // An empty run still reports, and root hooks alone still run.
        const current = cycle ??= open({}, true)
        current.held = false
        schedule()
        current.closing = true
        const {services, channel, id} = current
        try {
            services.resolve(await conclude(current))
        } catch (error) {
            services.reject(error)
        }
        // The verdict goes out once the cleanups are through, a failure as one
        // too. The channel is let go of once it has taken the word.
        const result = await services.finished.then(result => result, (): SessionResult => ({success: false}))
        await new Promise<void>(resolve => {
            channel.send({type: "session:end", session: id, data: result}, (err) => {
                if (err) services.stderr.write(`${stringify(err)}\n`)
                resolve()
            })
        })
        channel.disconnect()
        // A partially executed registry is unsafe to retry.
        resetHarnessState(harness)
        cycle = null
        return await services.finished
    }

    // A suite that does not load is one failed test named after the file,
    // as node --test files it. The run goes on to the next.
    // The files all load before the run, as under node --test.
    const load: TAL.SessionAPI["load"] = async file => {
        if (cycle?.closing) throw new Error("load() cannot be called once run() has started")
        try {
            await import(file)
        } catch (error) {
            harness.root.declareTest(file.replace(/^[^?]*\//, ""), {}, () => {
                throw error
            })
            schedule()
        }
    }

    return {session, run, load, schedule}
}

// The run's summary: the counts, the time and the verdict.
const summaryOf = ({run, startedAt}: Cycle): TAL.TestSummary => ({
    counts: {...run.counters},
    duration_ms: performance.now() - startedAt,
    success: run.success,
})
