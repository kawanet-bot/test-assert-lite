import type * as declared from "test-assert-lite"
import {html} from "../reporter/html.ts"
import {spec} from "../reporter/spec.ts"
import {tap} from "../reporter/tap.ts"
import type {Run} from "../suite/job.ts"
import {VERSION} from "../utils/version.ts"
import {client, line} from "./client.ts"
import type {ReportStream} from "./report-stream.ts"
import type {HarnessState} from "./state.ts"

type ReporterFn = declared.TAL.ReporterFn
type OutputFn = declared.TAL.OutputFn
type SessionOptions = declared.TAL.SessionOptions
type Session = declared.TAL.Session
type EventTargetLike = declared.TAL.EventTargetLike
type TestSummary = declared.TAL.TestSummary

// What a run reports with and where the page's console goes: opened by
// session(), or with the defaults on the first declaration, until end()
// closes it with the verdict.
interface Open {
    reporter: ReporterFn
    output: OutputFn
    // As given to session(); read where the footer goes.
    summary: boolean | undefined
    session: Session
    end: (success: boolean) => Promise<void>
    // Opened by a declaration rather than by session(): the refusal differs.
    auto: boolean
    // Lets go of the errors outside the tests, where capture took them.
    release: () => void
}

export interface SessionControl {
    session: typeof declared.session
    // Closes the session with the run's verdict; nothing to close is fine.
    close: (success: boolean) => Promise<void>
    // Opens the default session unless one is open already.
    open: () => void
    // Gives a run's stream the settings of the session.
    attach: (stream: ReportStream) => void
    // Emits the lines after the tests, ahead of the summary event, as the session has it.
    footer: (emit: Run["emit"], summary: TestSummary) => Promise<void>
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
const capture = (harness: HarnessState, target: EventTargetLike): (() => void) => {
    const take = (name: string, error: unknown): void => {
        harness.root.declareTest(name, {}, () => {
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
const isEventTarget = (value: unknown): value is EventTargetLike => {
    const v = value as Partial<EventTargetLike> | null | undefined
    return "function" === typeof v?.addEventListener && "function" === typeof v?.removeEventListener
}

// true is the window, where there is one; under Node, whose errors nothing
// takes yet, true means nothing. Anything else is listened on as given.
const targetOf = (capture: SessionOptions["capture"]): EventTargetLike | undefined => {
    const target = capture === true ? globalThis : capture
    return isEventTarget(target) ? target : undefined
}

const reporterMap = new Map<string, () => ReporterFn>([
    ["html", html],
    ["spec", spec],
    ["tap", tap],
])

export const createSessions = (harness: HarnessState): SessionControl => {
    let current: Open | null = null

    // A name with no reporter behind it runs with spec, and is one failed
    // test at the root, filed as capture files a window's errors.
    const reporterOf = (v: ReporterFn | string | undefined): ReporterFn => {
        if (!v) return spec()
        if ("function" === typeof v) return v
        const init = reporterMap.get(v)
        if (init) return init()
        return lazyReporter(v)
    }

    // A module name is imported when the run starts reporting, its default
    // export the reporter, as node --test-reporter takes one. A name that
    // does not import, or starts with "." and would resolve against this
    // module, is a failed test at the root, and the run goes on with spec.
    const lazyReporter = (v: string): ReporterFn => {
        return async function* (source) {
            let error: Error | null = null
            const module = /^\./.test(v) ? null : await import(v).catch((e: Error) => (void (error = e)))
            let reporter: unknown = module?.default
            if (error || "function" !== typeof reporter) {
                harness.root.declareTest(`import(${JSON.stringify(v)})`, {}, () => {
                    throw error || new Error(`unsupported reporter: ${v}`)
                })
                reporter = spec()
            }
            yield* (reporter as ReporterFn)(source)
        }
    }

    const create = (options: SessionOptions, auto: boolean): Open => {
        const {base} = options
        const reporter = reporterOf(options.reporter)
        const url = base == null ? null : new URL(base)
        const opened = (open: Omit<Open, "release" | "auto" | "summary">): Open => {
            const target = targetOf(options.capture)
            const release = target == null ? () => undefined : capture(harness, target)
            return {...open, auto, release, summary: options.summary}
        }
        if (url != null && CHANNEL.test(url.pathname)) {
            const channel = client(url)
            void channel.begin()
            return opened({
                reporter,
                output: options.output ?? (text => channel.stdout(text)),
                session: {stdout: channel.stdout, stderr: channel.stderr},
                end: channel.end,
            })
        }
        const stdout = writer("stdout")
        const stderr = writer("stderr")
        return opened({
            reporter,
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

    const close = async (success: boolean): Promise<void> => {
        const open = current
        if (open == null) return
        current = null
        open.release()
        await open.end(success)
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
        // node:test's summary in words, then what it never says: which
        // package ran the suites, and where, as the browser or Node names
        // itself. summary: false leaves it all off, for a script that is no suite.
        footer: async (emit, summary) => {
            if (current?.summary === false) return
            const info = async (label: string, value: number | string) => {
                await emit("test:diagnostic", {
                    message: `${label} ${value}`, nesting: 0, level: "info",
                })
            }
            await info("tests", summary.counts.tests)
            await info("suites", summary.counts.suites)
            await info("pass", summary.counts.passed)
            await info("fail", summary.counts.failed)
            await info("cancelled", summary.counts.cancelled)
            await info("skipped", summary.counts.skipped)
            await info("todo", summary.counts.todo)
            await info("duration_ms", summary.duration_ms)
            await info("test-assert-lite", VERSION)
            const userAgent = globalThis.navigator?.userAgent
            if (userAgent) {
                await info("user-agent", userAgent)
            }
        },
    }
}
