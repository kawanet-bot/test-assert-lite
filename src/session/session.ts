// The session: what a run reports with, where its console goes, and what
// it lets go of at the end. The writers on the entry hold text between
// sessions and pass it through while one is open.

import type {TAL} from "test-assert-lite"
import {createConnectWriter, pureWriter} from "../utils/buf-writer.ts"
import {client} from "./client.ts"
import {consoleWriters, saveConsole, takeConsole} from "./console.ts"
import type {ReportStream} from "./report-stream.ts"
import {chooseReporter} from "./reporters.ts"
import type {HarnessState} from "./state.ts"
import {takeUncaught} from "./uncaught.ts"

type ReporterFn = TAL.ReporterFn
type OutputFn = TAL.OutputFn
type SessionOptions = TAL.SessionOptions
type Writer = TAL.Writer

// What a run reports with: opened by session(), or with the defaults on
// the first declaration, until end() closes it with the verdict.
interface Open {
    reporter: ReporterFn
    output: OutputFn
    end: (result: TAL.SessionResult) => Promise<void>
    // Opened by a declaration rather than by session(): the refusal differs.
    auto: boolean
    // Lets go of what the session took: the errors outside the tests, and the console.
    release: () => void
}

export interface SessionControl {
    session: TAL.SessionAPI["session"]
    // Closes the session with the run's verdict; nothing to close is fine.
    close: (success: boolean) => Promise<void>
    // Opens the default session unless one is open already.
    open: () => void
    // Gives a run's stream the settings of the session.
    attach: (stream: ReportStream) => void
    stdout: Writer
    stderr: Writer
}

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
        const releaseErrors = options.uncaught == null ? () => undefined : takeUncaught(harness, options.uncaught)
        const releaseConsole = options.console == null ? () => undefined : takeConsole(found, saved, stdout, stderr)
        const release = (): void => {
            releaseErrors()
            releaseConsole()
        }
        if (options.fetch != null) {
            const channel = client(options.fetch)
            void channel.begin()
            stdout.connect(channel.stdout)
            stderr.connect(channel.stderr)
            return {reporter, output, end: channel.end, auto, release}
        }
        // Node's process streams where they exist, the console the session found otherwise.
        const hasProcess = "undefined" !== typeof process && process.stdout?.write != null
        if (hasProcess) {
            stdout.connect(process.stdout)
            stderr.connect(process.stderr)
        } else {
            const fallback = consoleWriters(found, saved)
            stdout.connect(fallback.stdout)
            stderr.connect(fallback.stderr)
        }
        return {reporter, output, end: async () => undefined, auto, release}
    }

    const session: TAL.SessionAPI["session"] = (options = {}) => {
        if (current != null) {
            throw new Error(current.auto ? "session() must come before the first test is declared" : "session() is already open")
        }
        current = create(options, false)
    }

    const close = async (success: boolean): Promise<void> => {
        const open = current
        if (open == null) return
        current = null
        stdout.disconnect()
        stderr.disconnect()
        open.release()
        await open.end({success})
    }

    return {
        session,
        close,
        open: () => {
            current ??= create({}, true)
        },
        attach: (stream) => {
            current ??= create({}, true)
            stream.attach(current.reporter, current.output)
        },
        stdout: pureWriter(stdout),
        stderr: pureWriter(stderr),
    }
}
