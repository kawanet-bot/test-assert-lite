import type * as declared from "test-assert-lite"
import {html} from "./reporter/html.ts"
import {spec} from "./reporter/spec.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn

interface QueueItem {
    event: TestEvent
    resolve: () => void
    reject: (error: unknown) => void
}

// Bridges emit() to an async generator formatter. A request for the next
// event means the previous one has been written, and that is when emit()'s
// promise settles, so run() stays in step by awaiting emit alone.
class Pipe {
    private format: FormatFn
    private output: OutputFn
    private pending: QueueItem[] = []
    private active: QueueItem | null = null
    private wake: (() => void) | null = null
    private closed = false
    private failed = false
    private failure: unknown
    private loop: Promise<void> | null = null

    constructor(format: FormatFn, output: OutputFn) {
        this.format = format
        this.output = output
    }

    emit(event: TestEvent): Promise<void> {
        if (this.closed) return this.rejected(new Error("Reporter is closed"))
        if (this.failed) return this.rejected(this.failure)

        const promise = new Promise<void>((resolve, reject) => {
            this.pending.push({event, resolve, reject})
            const wake = this.wake
            this.wake = null
            wake?.()
        })
        // Public emit() is normally awaited, but TestContext.diagnostic() is
        // deliberately synchronous. Mark every rejection handled here while
        // preserving it for awaiters and close().
        void promise.catch(() => undefined)
        this.start()
        return promise
    }

    async close(): Promise<void> {
        if (this.loop == null) return
        this.closed = true
        const wake = this.wake
        this.wake = null
        wake?.()
        await this.loop
    }

    private rejected(error: unknown): Promise<void> {
        const promise = Promise.reject(error)
        void promise.catch(() => undefined)
        return promise
    }

    private fail(error: unknown): void {
        if (this.failed) return
        this.failed = true
        this.failure = error
        this.active?.reject(error)
        this.active = null
        for (const item of this.pending.splice(0)) item.reject(error)
        const wake = this.wake
        this.wake = null
        wake?.()
    }

    private start(): void {
        if (this.loop != null) return
        this.loop = this.consume().catch(error => {
            this.fail(error)
            throw error
        })
        // close() observes the rejection. This handler only prevents an
        // unhandledRejection in the interval before run() reaches close().
        void this.loop.catch(() => undefined)
    }

    private async consume(): Promise<void> {
        for await (const chunk of this.format(this.source())) {
            if (chunk) await this.output(chunk)
        }
        if (!this.closed) {
            throw new Error("Reporter formatter ended before its input")
        }
    }

    private async *source(): AsyncGenerator<TestEvent> {
        for (;;) {
            while (!this.pending.length) {
                if (this.closed) return
                await new Promise<void>(resolve => (this.wake = resolve))
            }
            const item = this.pending.shift()!
            this.active = item
            let consumed = false
            try {
                yield item.event
                consumed = true
            } finally {
                // A normal next() resumes after yield. Iterator cleanup jumps
                // straight to finally, leaving the item for fail() to reject.
                if (consumed) {
                    if (this.active === item) this.active = null
                    item.resolve()
                }
            }
        }
    }
}

const defaultOutput: OutputFn = (text) => {
    // console.log adds its own newline, so drop the trailing one
    console.log(text.replace(/\n$/, ""))
}

// Closing a per-run Pipe is an internal step driven by run(), so it comes
// back on a separate handle rather than on the public Reporter.
export interface ReporterControl {
    reporter: declared.TAL.Reporter
    begin: () => Promise<void>
    close: () => Promise<void>
}

export const createReporter = (): ReporterControl => {
    let format: FormatFn = spec()
    let output: OutputFn = defaultOutput
    let pipe: Pipe | null = null

    // Standalone events follow the latest output setting. A run replaces
    // this Pipe with one that holds its startup snapshot directly.
    const current = (): Pipe => pipe ??= new Pipe(format, text => output(text))
    const close = async (): Promise<void> => {
        const active = pipe
        if (active == null) return
        try {
            await active.close()
        } finally {
            if (pipe === active) pipe = null
        }
    }

    return {
        reporter: {
            emit: (type, data) => current().emit({type, data} as TestEvent),
            // Configuration belongs to the TAL instance. Each run creates a
            // fresh Pipe and formatter consumer from these retained values.
            format: (fn) => {
                format = fn
            },
            output: (fn) => {
                output = fn
            },
            spec,
            html,
        },
        // A standalone emit() may have opened a Pipe with older settings.
        // Finish it before snapshotting the current configuration for run().
        begin: async () => {
            // Its own emit() already owns any failure. A new run starts a
            // separate session and must not inherit that previous error.
            try {
                await close()
            } catch {
                // discarded standalone session
            }
            pipe = new Pipe(format, output)
        },
        close,
    }
}
