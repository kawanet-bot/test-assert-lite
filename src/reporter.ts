import type * as declared from "test-assert-lite"

import {spec} from "./spec.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn

// Bridges emit() to an async generator formatter. A request for the next
// event means the previous one has been written, and that is when emit()'s
// promise settles, so run() stays in step by awaiting emit alone.
class Pipe {
    private format: FormatFn
    private output: OutputFn
    private pending: {event: TestEvent, resolve: () => void, reject: (error: unknown) => void}[] = []
    private wake: (() => void) | null = null
    private closed = false
    private failed = false
    private failure: unknown
    private loop: Promise<void> | null = null
    private summarySeen = false

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
        if (!this.closed && !this.summarySeen) {
            throw new Error("Reporter formatter ended before test:summary")
        }
    }

    private async *source(): AsyncGenerator<TestEvent> {
        for (;;) {
            while (!this.pending.length) {
                if (this.closed) return
                await new Promise<void>(resolve => (this.wake = resolve))
            }
            const item = this.pending.shift()!
            try {
                if (item.event.type === "test:summary") this.summarySeen = true
                yield item.event
            } finally {
                item.resolve()
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
    close: () => Promise<void>
}

export const createReporter = (): ReporterControl => {
    let format: FormatFn = spec()
    let output: OutputFn = defaultOutput
    let pipe: Pipe | null = null

    const current = (): Pipe => pipe ??= new Pipe(format, output)

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
            html: () => spec({colors: false}),
        },
        close: async () => {
            const active = pipe
            if (active == null) return
            try {
                await active.close()
            } finally {
                if (pipe === active) pipe = null
            }
        },
    }
}
