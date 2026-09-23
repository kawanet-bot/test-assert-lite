// Bridges write() to an async generator reporter. A request for the next
// event means the previous one has been written, and that is when write()'s
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

// What the reporter's loop came to. Its failure is the run's once an
// emit() has delivered it, and close()'s to throw until then.
interface Failed {
    failure: unknown
    delivered: boolean
}

export interface ReportStream {
    write: (event: TestEvent) => Promise<void>
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
    // The events not yet consumed. The head is the one the reporter holds.
    const pending: QueueItem[] = []
    // Resumes the source while it waits for an event, or for the end.
    let wake: (() => void) | null = null
    // Set by close(). The input ends once the queue is empty.
    let closed = false
    // What the reporter's loop failed with, if it did.
    let failed: Failed | null = null

    const wakeUp = (): void => {
        const fn = wake
        wake = null
        fn?.()
    }

    const fail = (error: unknown): void => {
        if (failed != null) return
        failed = {failure: error, delivered: pending.length > 0}
        for (const item of pending.splice(0)) item.reject(error)
        wakeUp()
    }

    // Consumed once the reporter asks for the next event. Iterator cleanup
    // leaves the head where it is, for fail() to reject.
    async function* source(): AsyncGenerator<TestEvent> {
        for (;;) {
            while (!pending.length) {
                if (closed || failed != null) return
                await new Promise<void>(resolve => (wake = resolve))
            }
            const item = pending[0]!
            yield item.event
            pending.shift()
            item.resolve()
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
    // unhandledRejection in the interval before the cleanups reach close().
    void loop.catch(() => undefined)

    const write: ReportStream["write"] = async (event) => {
        if (failed != null) {
            failed.delivered = true
            throw failed.failure
        }
        if (closed) throw new Error("Reporter is closed")
        await new Promise<void>((resolve, reject) => {
            pending.push({event, resolve, reject})
            wakeUp()
        })
    }

    const close = async (): Promise<void> => {
        closed = true
        wakeUp()
        try {
            await loop
        } catch (error) {
            if (!failed?.delivered) throw error
        }
    }

    services.onCleanup(close)
    return {write}
}
