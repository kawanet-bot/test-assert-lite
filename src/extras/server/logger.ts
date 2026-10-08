// The access log as one middleware, in morgan's tiny format: method, URL,
// status, content length and the time to respond, a "-" for what is not
// known. The length is the Content-Length a handler set: a Response's body
// is read only when it is written, after the chain.

import type {TAL} from "test-assert-lite"
import type {MiddlewareHandler} from "./middleware.ts"

export interface LoggerOptions {
    /** The destination of the lines. */
    stderr: TAL.Writer
    /** Limits the lines to unsuccessful responses. */
    quiet?: boolean
}

/**
 * Logs each response once the chain inside has answered it.
 */
export const logger = ({stderr, quiet}: LoggerOptions): MiddlewareHandler => async (c, next) => {
    const started = performance.now()
    await next()
    const {status} = c.res
    if (quiet && status < 400) return
    const {method, url} = c.req
    const path = url.slice(url.indexOf("/", 8))
    const length = c.res.headers.get("content-length") ?? (c.res.body == null ? "0" : "-")
    stderr.write(`${method} ${path} ${status} ${length} - ${(performance.now() - started).toFixed(3)} ms\n`)
}
