// Loopback server behind the browser test CLI: runs a middleware chain
// over node:http, as @hono/node-server runs a Hono app. It knows nothing
// about Playwright, the suites or the files: a Node request becomes a
// web-standard Request, the chain's Response goes back out, and every
// response gets a line in the log.

import type {IncomingMessage} from "node:http"
import {createServer} from "node:http"
import type {Context, MiddlewareHandler} from "./middleware.ts"
import {createContext} from "./middleware.ts"

export interface ServeOptions {
    /** The chain every request goes to; what it leaves unanswered is a 404. */
    handler: MiddlewareHandler
    /** Address to listen on; 127.0.0.1 by default. */
    host?: string
    /** Gets one line per response, in morgan's tiny format, and any error; none without it. */
    log?: (line: string) => void
}

export interface Server {
    origin: string

    close(): void
}

// The Request a Node request stands for, the body read in first: what
// comes in is the page's few lines of text, so nothing is lost by not
// streaming. A target that is not a path, "*" say, makes no URL; a doubled
// slash or a bad escape goes onto the origin as it came, for the chain.
const toRequest = async (req: IncomingMessage, origin: string): Promise<Request> => {
    const url = req.url ?? ""
    if (!url.startsWith("/")) throw new Error(`Not a path: ${url}`)
    const headers = new Headers()
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i] as string, req.rawHeaders[i + 1] as string)
    const chunks: Uint8Array[] = []
    for await (const chunk of req) chunks.push(chunk as Uint8Array)
    const body = req.method === "GET" || req.method === "HEAD" ? null : new Uint8Array(Buffer.concat(chunks))
    return new Request(origin + url, {method: req.method, headers, body})
}

// The access log line: method, URL, status, body length and the time to
// respond, as morgan's tiny format has them, a "-" for anything missing.
const tiny = (req: IncomingMessage, status: number, length: number, ms: number): string =>
    [req.method, req.url, status, length, null, ms.toFixed(3), "ms"].map(v => v || "-").join(" ")

// 127.0.0.1 rather than localhost on both ends: a browser may resolve
// localhost to ::1 while this listens on IPv4 only. Port 0 picks a free one.
// A wildcard address listens on every interface but names none, so the
// origin falls back to the loopback one; an IPv6 literal needs brackets.
export const serve = async ({handler, host = "127.0.0.1", log}: ServeOptions): Promise<Server> => {
    const named = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host
    let origin = ""

    // A request the chain throws on is a 500, the error going to the log
    // ahead of its line; one that is not even a URL is a 400. Either way
    // the client draws an answer for its own request and nothing more.
    const respond = async (req: IncomingMessage): Promise<Response> => {
        let c: Context | null = null
        try {
            c = createContext(await toRequest(req, origin))
            await handler(c, async () => undefined)
            return c.finalized ? c.res : await c.notFound()
        } catch (error) {
            log?.(error instanceof Error ? error.stack ?? error.message : String(error))
            return new Response(null, {status: c == null ? 400 : 500})
        }
    }

    const server = createServer((req, res) => {
        const started = performance.now()
        void respond(req).then(async response => {
            const body = Buffer.from(await response.arrayBuffer())
            res.writeHead(response.status, {...Object.fromEntries(response.headers), "content-length": String(body.length)})
            res.end(body)
            log?.(tiny(req, response.status, body.length, performance.now() - started))
        })
    })
    await new Promise<void>(listening => server.listen(0, host, listening))
    const address = server.address()
    const port = (typeof address === "object" && address != null) ? address.port : 0
    origin = `http://${named}:${port}`
    return {
        origin,
        close: () => {
            server.close()
            server.closeAllConnections()
        },
    }
}
