// The CLI's side of the channel to the page it drives: the run's own path,
// which only this process and that page know, and the endpoints under it
// the page reports to, as the page's session sends: begin, the two streams
// and the verdict at the end. What comes in goes to the streams given;
// nothing changes in the protocol here without a change in the client.

import type {TAL} from "test-assert-lite"
import {stringify} from "../../utils/stringify.ts"
import type {HostServices} from "../host-services.ts"
import type {ContextLike, Next} from "./middleware.ts"

export interface ChannelOptions {
    /** Shared host-side streams, lifecycle and cleanup. */
    services: HostServices
    /** Prefix for channel path: `/@tal/run/xxxxxxxxx/` */
    prefix: string
    /** Allowed silence in milliseconds; unlimited when omitted. */
    timeout?: number
}

export interface Channel {
    /** Takes the page's reports, each a POST under the path, and answers 204; 405 to any other method. */
    handler: (c: ContextLike, next: Next) => Promise<Response | void>
}

type CommandName = "begin" | "stdout" | "stderr" | "end"

const isTestResult = (v: unknown): v is TAL.SessionResult => ("boolean" === typeof (v as TAL.SessionResult)?.success)

/**
 * Creates the endpoints that receive the page's reports and result.
 * Applies a silence timeout when one is given.
 */
export const createChannel = ({prefix, services, timeout}: ChannelOptions): Channel => {
    let begun = false
    let ended = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const heard = (): void => {
        if (timer != null) clearTimeout(timer)
        if (ended) return
        timer = setTimeout(() => {
            if (begun) {
                services.reject(new Error(`No word from the page for ${timeout! / 1000} seconds: the browser, its tab or the session is gone`))
            } else {
                services.reject(new Error("The page never reported in: could the browser reach the server?"))
            }
        }, timeout)
    }

    const commands: Record<CommandName, (body: string) => undefined | number> = {
        begin: (body) => {
            try {
                const payload = body ? JSON.parse(body) as unknown : undefined
                services.begin(payload)
                begun = true
            } catch (e) {
                services.stderr.write(`${stringify(e)}\n`)
                return 400
            }
        },
        stdout: (body) => void services.stdout.write(body),
        stderr: (body) => void services.stderr.write(body),
        end: (body) => {
            try {
                const payload = body ? JSON.parse(body) as TAL.SessionResult : undefined
                if (!isTestResult(payload)) return 400
                services.end(payload)
                ended = true
            } catch (e) {
                services.stderr.write(`${stringify(e)}\n`)
                return 400
            }
        },
    }

    const commandNames = Object.keys(commands)
    const isCommandName = (v: string): v is CommandName => commandNames.includes(v)

    const handler = async (c: ContextLike, next: Next) => {
        if (!c.req.path.startsWith(prefix)) return next()
        const command = c.req.path.slice(prefix.length)
        const endpoint = isCommandName(command) && commands[command]
        if (!endpoint) return next()
        if (c.req.method !== "POST") return c.body(null, 405, {allow: "POST"})
        const status = endpoint(await c.req.text()) ?? 204
        if (timeout) heard()
        return c.body(null, status)
    }

    if (timeout) {
        services.onCleanup(() => {
            if (timer != null) clearTimeout(timer)
        })
        heard()
    }

    return {handler}
}
