// The CLI's side of the channel to the page it drives: the run's own path,
// which only this process and that page know, and the endpoints under it
// the page reports to, as the page's session sends: begin, the two streams
// and the verdict at the end. What comes in goes to the streams given;
// nothing changes in the protocol here without a change in the client.

import type {TAL} from "test-assert-lite"
import type {MiddlewareHandler} from "./middleware.ts"

export interface ChannelOptions {
    /** Where the page's stdout goes. */
    stdout: TAL.Writer
    /** Where the page's stderr goes. */
    stderr: TAL.Writer
    /** Prefix for channel path: `/@tal/run/xxxxxxxxx/` */
    prefix: string
}

export interface Channel {
    /** Takes the page's reports, each a POST under the path, and answers 204; 405 to any other method. */
    handler: MiddlewareHandler
    /** The verdict the page reports at its end; rejects if it never begins. */
    done: Promise<boolean>

    /** Stops waiting for the page. */
    close(): void
}

// How long the page may stay silent. Before it has begun, the browser
// could not reach the server, most likely; after that, a quiet page says
// so every ten seconds, so silence this long means the browser, its tab
// or the session is gone. A hung test is not silence, and waits as it would
// under node --test.
const SILENCE_MS = 30_000

/**
 * Starts a run: from here on the page has the silence bound to report
 * within, and the verdict is what it says at its end.
 */
export const createChannel = ({prefix, stdout, stderr}: ChannelOptions): Channel => {
    // The verdict: true from the page's end alone passes, anything else
    // fails, and the first one counts; the streams still go through after
    // it. Every word from the page restarts the silence bound; a run nobody
    // awaits, --serve, lapses.
    let begun = false
    let ended = false
    let settle: (success: boolean) => void = () => undefined
    let lapse: (error: Error) => void = () => undefined
    const done = new Promise<boolean>((resolve, reject) => {
        settle = resolve
        lapse = reject
    })
    void done.catch(() => undefined)
    let timer: ReturnType<typeof setTimeout> | null = null
    const heard = (): void => {
        if (timer != null) clearTimeout(timer)
        if (ended) return
        timer = setTimeout(() => lapse(new Error(begun
            ? "No word from the page for 30 seconds: the browser, its tab or the session is gone"
            : "The page never reported in: could the browser reach the server?")), SILENCE_MS)
        timer.unref()
    }

    const endpointList: [string, (body: string) => void][] = [
        ["begin", () => (begun = true)],
        ["stdout", (body) => stdout.write(body)],
        ["stderr", (body) => stderr.write(body)],
        ["end", (body) => {
            ended = true
            settle(body === "true")
        }],
    ]

    const endpointMap = new Map(endpointList)

    heard()
    return {
        handler: async (c, next) => {
            if (!c.req.path.startsWith(prefix)) return next()
            const command = c.req.path.slice(prefix.length)
            const endpoint = endpointMap.get(command)
            if (endpoint == null) return next()
            if (c.req.method !== "POST") return c.body(null, 405, {allow: "POST"})
            endpoint(await c.req.text())
            heard()
            return c.body(null, 204)
        },
        done,
        close: () => {
            if (timer != null) clearTimeout(timer)
        },
    }
}
