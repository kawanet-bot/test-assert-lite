import type * as declared from "test-assert-lite"
import {client, line} from "./reporter/client.ts"
import type {ReportStream} from "./reporter/report-stream.ts"
import {spec} from "./reporter/spec.ts"

type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn
type SessionOptions = declared.TAL.SessionOptions
type Session = declared.TAL.Session

// What a run reports with and where the page's console goes: opened by
// session(), or with the defaults on the first declaration, until end().
interface Open {
    format: FormatFn
    output: OutputFn
    session: Session
    end: (success: boolean) => Promise<void>
    // Opened by a declaration rather than by session(): the refusal differs.
    auto: boolean
}

export interface SessionControl {
    session: typeof declared.session
    end: typeof declared.end
    // Opens the default session unless one is open already.
    open: () => void
    // Gives a run's stream the settings of the session.
    attach: (stream: ReportStream) => void
}

// A base under a run's own URL connects the page to the CLI; any other
// base means nothing here.
const CHANNEL = /^\/@tal\/run\//

const defaultOutput: OutputFn = (text) => {
    // console.log adds its own newline, so drop the trailing one
    console.log(text.replace(/\n$/, ""))
}

// Node's process streams where they exist, the console in a browser.
const writer = (name: "stdout" | "stderr"): ((text: string) => void) => {
    const stream = "undefined" !== typeof process ? process[name] : undefined
    if (stream?.write != null) return text => void stream.write(text)
    const log = name === "stdout" ? console.log : console.error
    return text => log(text.replace(/\n$/, ""))
}

export const createSessions = (): SessionControl => {
    let current: Open | null = null

    const create = (options: SessionOptions, auto: boolean): Open => {
        const {format = spec(), base} = options
        const url = base == null ? null : new URL(base)
        if (url != null && CHANNEL.test(url.pathname)) {
            const channel = client(url)
            void channel.begin()
            return {
                format,
                output: options.output ?? (text => channel.stdout(text)),
                session: {stdout: channel.stdout, stderr: channel.stderr},
                end: channel.end,
                auto,
            }
        }
        const stdout = writer("stdout")
        const stderr = writer("stderr")
        return {
            format,
            output: options.output ?? defaultOutput,
            session: {stdout, stderr: item => stderr(line(item))},
            end: async () => undefined,
            auto,
        }
    }

    const session: typeof declared.session = (options = {}) => {
        if (current != null) {
            throw new Error(current.auto ? "session() must come before the first test is declared" : "session() is already open")
        }
        current = create(options, false)
        return current.session
    }

    const end: typeof declared.end = async (success) => {
        const open = current
        if (open == null) return
        current = null
        await open.end(success)
    }

    return {
        session,
        end,
        open: () => {
            current ??= create({}, true)
        },
        attach: (stream) => {
            current ??= create({}, true)
            stream.attach(current.format, current.output)
        },
    }
}
