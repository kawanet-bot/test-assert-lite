import type * as declared from "test-assert-lite"

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
export class ReportStream {
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
