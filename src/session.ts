import type * as declared from "test-assert-lite"
import {client, line} from "./reporter/client.ts"
import type {ReportStream} from "./reporter/report-stream.ts"
import {spec} from "./reporter/spec.ts"
import type {HarnessState} from "./runner/suite.ts"

type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn
type SessionOptions = declared.TAL.SessionOptions
type Session = declared.TAL.Session
type EventTarget = declared.TAL.EventTarget

// What a run reports with and where the page's console goes: opened by
// session(), or with the defaults on the first declaration, until end().
interface Open {
    format: FormatFn
    output: OutputFn
    session: Session
    end: (success: boolean) => Promise<void>
    // Opened by a declaration rather than by session(): the refusal differs.
    auto: boolean
    // Lets go of the errors outside the tests, where capture took them.
    release: () => void
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

// The suites are served under a digest-named directory; the name a
// person knows is what follows it.
const SERVED = /^\/@tal\/files\/[0-9a-f]{9}\//

// The uncaught errors and unhandled rejections of a window, or of what
// stands in for one, each one failed test at the root, named after the
// script it came from where the event says, as a suite that threw is
// under Node. Declared on the root itself, since one may arrive while a
// test body is open, and the walk takes it.
const capture = (harness: HarnessState, target: EventTarget): (() => void) => {
    const take = (name: string, error: unknown): void => {
        harness.root.declare("test", name, {}, () => {
            throw error
        })
    }
    const nameOf = (url: string | undefined): string | undefined => {
        try {
            return url ? new URL(url).pathname.replace(SERVED, "") : undefined
        } catch {
            return url
        }
    }
    const onError = (event: unknown): void => {
        const {error, message, filename, target} = event as Partial<ErrorEvent>
        const src = (target as {src?: string} | null | undefined)?.src
        const name = nameOf(filename || src) ?? "error"
        take(name, error ?? new Error(message || `failed to load ${name}`))
    }
    const onRejection = (event: unknown): void => {
        take("unhandled rejection", (event as Partial<PromiseRejectionEvent>).reason)
    }
    target.addEventListener("error", onError, true)
    target.addEventListener("unhandledrejection", onRejection)
    return () => {
        target.removeEventListener("error", onError, true)
        target.removeEventListener("unhandledrejection", onRejection)
    }
}

// What takes a listener: a window has it, Node's global does not.
const isEventTarget = (value: unknown): value is EventTarget =>
    "function" === typeof (value as Partial<EventTarget> | null | undefined)?.addEventListener

// true is the window, where there is one; under Node, whose errors nothing
// takes yet, true means nothing. Anything else is listened on as given.
const targetOf = (capture: SessionOptions["capture"]): EventTarget | undefined => {
    const target = capture === true ? globalThis : capture
    return isEventTarget(target) ? target : undefined
}

export const createSessions = (harness: HarnessState): SessionControl => {
    let current: Open | null = null

    const create = (options: SessionOptions, auto: boolean): Open => {
        const {format = spec(), base} = options
        const url = base == null ? null : new URL(base)
        const opened = (open: Omit<Open, "release" | "auto">): Open => {
            const target = targetOf(options.capture)
            const release = target == null ? () => undefined : capture(harness, target)
            return {...open, auto, release}
        }
        if (url != null && CHANNEL.test(url.pathname)) {
            const channel = client(url)
            void channel.begin()
            return opened({
                format,
                output: options.output ?? (text => channel.stdout(text)),
                session: {stdout: channel.stdout, stderr: channel.stderr},
                end: channel.end,
            })
        }
        const stdout = writer("stdout")
        const stderr = writer("stderr")
        return opened({
            format,
            output: options.output ?? defaultOutput,
            session: {stdout, stderr: item => stderr(line(item))},
            end: async () => undefined,
        })
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
        open.release()
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
