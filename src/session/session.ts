// The session: what a run reports with, where its console goes, and what
// it lets go of at the end. Each session is one RunServices: the entry's
// writers pass through its streams, and its cleanups undo what was taken.

import type {TAL} from "test-assert-lite"
import {createConnectWriter, pureWriter} from "../utils/buf-writer.ts"
import type {RunServices} from "../utils/run-services.ts"
import {createRunServices} from "../utils/run-services.ts"
import {client} from "./client.ts"
import {consoleWriters, saveConsole, takeConsole} from "./console.ts"
import {chooseReporter} from "./reporters.ts"
import type {HarnessState} from "./state.ts"
import {takeUncaught} from "./uncaught.ts"

type ReporterFn = TAL.ReporterFn
type OutputFn = TAL.OutputFn
type SessionOptions = TAL.SessionOptions
type SessionResult = TAL.SessionResult
type Writer = TAL.Writer

// What a run reports with: opened by session(), or with the defaults on
// the first declaration, until its services are resolved with the verdict.
export interface Open {
    services: RunServices
    reporter: ReporterFn
    output: OutputFn
    // Tells the CLI the verdict; nothing to tell without a channel.
    report: (result: SessionResult) => Promise<void>
    // Opened by a declaration rather than by session(): the refusal differs.
    auto: boolean
}

export interface SessionControl {
    session: TAL.SessionAPI["session"]
    // The session of the run under way, opened with the defaults if none is.
    open: () => Open
    stdout: Writer
    stderr: Writer
}

const hasProcess = (): boolean => "undefined" !== typeof process && process.stdout?.write != null

export const createSessions = (harness: HarnessState): SessionControl => {
    let current: Open | null = null
    const stdout = createConnectWriter()
    const stderr = createConnectWriter()

    const create = (options: SessionOptions, auto: boolean): Open => {
        const reporter = chooseReporter(harness, options)
        // The report goes where the console goes unless told otherwise.
        const output = options.output ?? ((text: string) => stdout.write(text))
        // Saved before anything is taken over, so nothing here loops back.
        const found = options.console ?? globalThis.console
        const saved = saveConsole(found)
        // The run's text goes to the CLI, to Node's streams, or to the console as found.
        const channel = options.fetch == null ? null : client(options.fetch)
        const services = createRunServices(
            channel != null ? {stdout: channel.stdout, stderr: channel.stderr}
                : hasProcess() ? {}
                    : consoleWriters(found, saved),
        )
        const open: Open = {services, reporter, output, report: channel == null ? async () => undefined : channel.end, auto}
        // The next session() is taken once this one is through.
        services.onCleanup(() => {
            if (current === open) current = null
        })
        if (options.uncaught != null) services.onCleanup(takeUncaught(harness, options.uncaught))
        if (options.console != null) services.onCleanup(takeConsole(found, saved, services.stdout, services.stderr))
        stdout.connect(services.stdout)
        stderr.connect(services.stderr)
        services.onCleanup(() => {
            stdout.disconnect()
            stderr.disconnect()
        })
        void channel?.begin()
        return open
    }

    const session: TAL.SessionAPI["session"] = (options = {}) => {
        if (current != null) {
            throw new Error(current.auto ? "session() must come before the first test is declared" : "session() is already open")
        }
        current = create(options, false)
    }

    return {
        session,
        open: () => (current ??= create({}, true)),
        stdout: pureWriter(stdout),
        stderr: pureWriter(stderr),
    }
}
