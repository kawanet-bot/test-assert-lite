// The page's side of the channel to the CLI: one call per endpoint under
// the run's base URL. Text is buffered per stream and sent in one request
// per flush, so a burst of a hundred console lines is one round trip.
// Node's fetch() is all it uses, so it runs anywhere with a base to reach.

export interface Client {
    /** Tells the CLI the page is up; it waits for this with a timeout. */
    begin(): Promise<void>
    /** Text for the CLI's stdout, buffered. */
    stdout(text: string): void
    /** Text for the CLI's stderr, buffered. */
    stderr(text: string): void
    /** The verdict, sent once the buffers have drained; true alone passes. */
    end(success: boolean): Promise<void>
}

type Stream = "stdout" | "stderr"

// How long lines gather before a flush: a test's burst of output becomes
// one request, while a person watching still sees it as it comes.
const FLUSH_MS = 50

/**
 * Connects to the CLI at `base`, the run's URL ending in "/". Sending
 * never rejects: the page can do nothing about a CLI that went away.
 */
export const connect = (base: string | URL): Client => {
    const buffers: Record<Stream, string> = {stdout: "", stderr: ""}
    let timer: ReturnType<typeof setTimeout> | null = null
    // Every request follows the one before, so each stream stays in order.
    let inflight: Promise<void> = Promise.resolve()

    const post = (path: string, body: string): Promise<void> => {
        inflight = inflight
            .then(() => fetch(new URL(path, base), {method: "POST", body}))
            .then(() => undefined, () => undefined)
        return inflight
    }

    const flush = (): Promise<void> => {
        if (timer != null) clearTimeout(timer)
        timer = null
        for (const stream of ["stdout", "stderr"] as const) {
            const text = buffers[stream]
            if (!text) continue
            buffers[stream] = ""
            void post(stream, text)
        }
        return inflight
    }

    const write = (stream: Stream, text: string): void => {
        buffers[stream] += text
        timer ??= setTimeout(flush, FLUSH_MS)
    }

    return {
        begin: () => post("begin", ""),
        stdout: text => write("stdout", text),
        stderr: text => write("stderr", text),
        end: async success => {
            await flush()
            await post("end", JSON.stringify(success === true))
        },
    }
}
