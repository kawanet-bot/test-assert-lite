import type * as declared from "test-assert-lite"

import {spec} from "./spec.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn

// Bridges emit() to an async generator formatter. A request for the next
// event means the previous one has been written, and that is when emit()'s
// promise settles, so run() stays in step by awaiting emit alone.
class Pipe {
    private pending: {event: TestEvent, done: () => void}[] = []
    private wake: (() => void) | null = null
    private closed = false
    private loop: Promise<void> | null = null
    private format: FormatFn = spec()
    private output: OutputFn = (text) => {
        // console.log adds its own newline, so drop the trailing one
        console.log(text.replace(/\n$/, ""))
    }

    setFormat(fn: FormatFn): void {
        this.format = fn
    }

    setOutput(fn: OutputFn): void {
        this.output = fn
    }

    emit(event: TestEvent): Promise<void> {
        this.start()
        return new Promise<void>(done => {
            this.pending.push({event, done})
            const wake = this.wake
            this.wake = null
            wake?.()
        })
    }

    async close(): Promise<void> {
        if (this.loop == null) return
        this.closed = true
        const wake = this.wake
        this.wake = null
        wake?.()
        await this.loop
        this.loop = null
        this.closed = false
    }

    private start(): void {
        if (this.loop != null) return
        this.loop = (async () => {
            for await (const chunk of this.format(this.source())) {
                if (chunk) await this.output(chunk)
            }
        })()
    }

    private async *source(): AsyncGenerator<TestEvent> {
        for (;;) {
            while (!this.pending.length) {
                if (this.closed) return
                await new Promise<void>(resolve => (this.wake = resolve))
            }
            const item = this.pending.shift()!
            try {
                yield item.event
            } finally {
                item.done()
            }
        }
    }
}

// close / reset are internal steps that run() drives, so they come back on
// a separate handle rather than on the public Reporter.
export interface ReporterControl {
    reporter: declared.TAL.Reporter
    close: () => Promise<void>
    reset: () => void
}

export const createReporter = (): ReporterControl => {
    let pipe = new Pipe()

    return {
        reporter: {
            emit: (type, data) => pipe.emit({type, data} as TestEvent),
            format: (fn) => pipe.setFormat(fn),
            output: (fn) => pipe.setOutput(fn),
            spec,
            html: () => spec({colors: false}),
        },
        close: () => pipe.close(),
        // Reset the formatter and output on every run() so that a setting
        // cannot leak from one test into the next.
        reset: () => {
            pipe = new Pipe()
        },
    }
}
