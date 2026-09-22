// Bridges emit() to an async generator reporter. A request for the next
// event means the previous one has been written, and that is when emit()'s
// promise settles, so end() stays in step by awaiting emit alone.

import type {TAL} from "test-assert-lite"
import type {RunServices} from "../utils/run-services.ts"

type TestEvent = TAL.TestEvent
type ReporterFn = TAL.ReporterFn
type OutputFn = TAL.OutputFn

interface QueueItem {
    event: TestEvent
    resolve: () => void
    reject: (error: unknown) => void
}

export interface ReportStream {
    emit: (event: TestEvent) => Promise<void>
}

export interface ReportStreamOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** What the events are formatted with. */
    reporter: ReporterFn
    /** Where the formatted text goes. */
    output: OutputFn
}

// Makes the stream of one run. Events go in through emit() and come out
// as text through the reporter. The stream closes as a cleanup of the run.
export const createReportStream = ({reporter, output, services}: ReportStreamOptions): ReportStream => {
    const pending: QueueItem[] = []
    let active: QueueItem | null = null
    let wake: (() => void) | null = null
    let closed = false
    let failed = false
    let failure: unknown
    // Set once an emit() has rejected with the failure. close() then keeps quiet about it.
    let delivered = false

    const rejected = (error: unknown): Promise<void> => {
        const promise = Promise.reject(error)
        void promise.catch(() => undefined)
        return promise
    }

    const wakeUp = (): void => {
        const fn = wake
        wake = null
        fn?.()
    }

    const fail = (error: unknown): void => {
        if (failed) return
        failed = true
        failure = error
        delivered = active != null || pending.length > 0
        active?.reject(error)
        active = null
        for (const item of pending.splice(0)) item.reject(error)
        wakeUp()
    }

    async function* source(): AsyncGenerator<TestEvent> {
        for (;;) {
            while (!pending.length) {
                if (closed) return
                await new Promise<void>(resolve => (wake = resolve))
            }
            const item = pending.shift()!
            active = item
            let consumed = false
            try {
                yield item.event
                consumed = true
            } finally {
                // A normal next() resumes after yield. Iterator cleanup jumps
                // straight to finally, leaving the item for fail() to reject.
                if (consumed) {
                    if (active === item) active = null
                    item.resolve()
                }
            }
        }
    }

    const consume = async (): Promise<void> => {
        for await (const chunk of reporter(source())) {
            if (chunk) await output(chunk)
        }
        if (!closed) {
            throw new Error("Reporter ended before its input")
        }
    }

    const loop = consume().catch(error => {
        fail(error)
        throw error
    })
    // close() observes the rejection. This handler only prevents an
    // unhandledRejection in the interval before end() reaches close().
    void loop.catch(() => undefined)

    const emit: ReportStream["emit"] = (event) => {
        if (closed) return rejected(new Error("Reporter is closed"))
        if (failed) {
            delivered = true
            return rejected(failure)
        }

        const promise = new Promise<void>((resolve, reject) => {
            pending.push({event, resolve, reject})
            wakeUp()
        })
        // emit() is normally awaited, but TestContext.diagnostic() is
        // deliberately synchronous. Mark every rejection handled here while
        // preserving it for awaiters and close().
        void promise.catch(() => undefined)
        return promise
    }

    // A failure that reached an emit() is the run's already. One that met
    // nobody, after the last event, is close()'s to throw.
    const close = async (): Promise<void> => {
        closed = true
        wakeUp()
        try {
            await loop
        } catch (error) {
            if (!delivered) throw error
        }
    }

    services.onCleanup(close)
    return {emit}
}
