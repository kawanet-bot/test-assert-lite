// Loopback server behind the browser test CLI: runs a middleware chain
// over node:http, as @hono/node-server runs a Hono app. It knows nothing
// about Playwright, the suites or the files: a Node request becomes a
// web-standard Request and the chain's Response goes back out. What the
// chain throws is a 500 with the error on stderr, what it leaves is a 404.

import type {IncomingMessage} from "node:http"
import {createServer} from "node:http"
import type {RunServices} from "../../utils/run-services.ts"
import {messageOf} from "../../utils/stringify.ts"
import type {Context, ErrorHandler, MiddlewareHandler} from "./middleware.ts"
import {compose, createContext} from "./middleware.ts"

export interface ServeOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** The chain every request goes to, one middleware or several in order. Unanswered is a 404. */
    handler: MiddlewareHandler | MiddlewareHandler[]
    /** Address to listen on; 127.0.0.1 by default. */
    host?: string
    /** Port to listen on; a free one by default. */
    port?: number
    /** The server's origin as a browser reaches it, scheme://host[:port], when not the address listened on. */
    origin?: string
}

export interface Server {
    /** Where a browser reaches the server: the origin given, or else the address listened on. */
    origin: string
}

// A Host header is an authority, a host and maybe a port, and nothing a
// URL would read as more: a path, a query or a user in it would move the
// target elsewhere rather than draw the 400 a Host that is no host does.
const AUTHORITY = /^(?:\[[0-9a-f:.]+\]|[^\[\]:/?#@\s]+)(?::\d+)?$/i

// The Request a Node request stands for, its URL from the Host header as
// the client sent it, the address listened on where there is none; the
// body read in first, as what comes in is the page's few lines of text.
// A target that is not a path, such as "*", or an invalid Host makes no URL.
// A doubled slash or a bad escape goes on as it came, for the chain.
const toRequest = async (req: IncomingMessage, bound: string): Promise<Request> => {
    const url = req.url ?? ""
    if (!url.startsWith("/")) throw new Error(`Not a path: ${url}`)
    const host = req.headers.host ?? bound
    if (!AUTHORITY.test(host)) throw new Error(`Not a host: ${host}`)
    const headers = new Headers()
    for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i] as string, req.rawHeaders[i + 1] as string)
    const chunks: Uint8Array[] = []
    for await (const chunk of req) chunks.push(chunk as Uint8Array)
    const body = req.method === "GET" || req.method === "HEAD" ? null : new Uint8Array(Buffer.concat(chunks))
    return new Request(`http://${host}${url}`, {method: req.method, headers, body})
}

// The response on its way out, once nothing can fail any more.
interface Answer {
    status: number
    headers: Record<string, string | string[]>
    body: Buffer
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// 127.0.0.1 rather than localhost on both ends: a browser may resolve
// localhost to ::1 while this listens on IPv4 only. Port 0 picks a free one.
// A wildcard address listens on every interface but names none, so the
// loopback of its family stands in; an IPv6 literal needs brackets.
export const serve = async ({handler, services, ...options}: ServeOptions): Promise<Server> => {
    // An empty host, as --port :3000 gives, is the default too, not the unspecified address.
    const host = options.host || "127.0.0.1"
    const named = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "[::1]" : host.includes(":") ? `[${host}]` : host
    let bound = ""

    const showError = (error: unknown): void => {
        services.stderr.write(`${error instanceof Error && error.stack || messageOf(error)}\n`)
    }

    // The chain answers every request it gets, as Hono's does: an Error
    // thrown is a 500, with the error on stderr, and what no middleware
    // answered is a 404. A middleware outside, such as the logger, sees both.
    const onError: ErrorHandler = (error, c) => {
        showError(error)
        return c.body(null, 500)
    }
    const chain = compose(Array.isArray(handler) ? handler : [handler], onError, c => c.notFound())

    // The answer as bytes, read in here: a Response body can fail on the
    // way in, and that is a 500 with the error on stderr, past the chain.
    // A target that is not even a URL is a 400. The client draws an answer
    // for its own request either way.
    const respond = async (req: IncomingMessage): Promise<Answer> => {
        let c: Context | null = null
        try {
            c = createContext(await toRequest(req, bound))
            await chain(c, async () => undefined)
            const response = c.finalized ? c.res : await c.notFound()
            // A record holds one value per name; Set-Cookie may come several times.
            const headers: Record<string, string | string[]> = Object.fromEntries(response.headers)
            const cookies = response.headers.getSetCookie()
            if (cookies.length) headers["set-cookie"] = cookies
            return {status: response.status, headers, body: Buffer.from(await response.arrayBuffer())}
        } catch (error) {
            showError(error)
            return {status: (c == null ? 400 : 500), headers: {}, body: Buffer.alloc(0)}
        }
    }

    const server = createServer((req, res) => {
        void respond(req).then(({status, headers, body}) => {
            res.writeHead(status, {...headers, "content-length": String(body.length)})
            res.end(body)
        })
    })

    services.onCleanup(async () => {
        server.close()
        await sleep(1)
        server.closeAllConnections()
    })

    // A port already taken is an error to the caller, not to the process.
    await new Promise<void>((listening, refused) => {
        server.once("error", refused)
        server.listen(options.port ?? 0, host, () => {
            server.off("error", refused)
            listening()
        })
    })

    const address = server.address()
    const port = (typeof address === "object" && address != null) ? address.port : 0
    bound = `${named}:${port}`

    return {
        origin: options.origin ?? `http://${bound}`,
    }
}
