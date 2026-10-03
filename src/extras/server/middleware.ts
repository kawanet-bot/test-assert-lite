// The shape of a Hono middleware, in the parts the browser test CLI uses:
// a Context around a web-standard Request, a handler that answers with a
// Response or hands on to the next, and compose() to chain handlers into
// one. Under Hono's names and types, so the application could one day
// mount into Hono itself; nothing here knows about Node or files.

/** Hands the request on to the middleware after this one. */
export type Next = () => Promise<void>

/** Answers with a Response, or leaves it to the rest of the chain with next(). */
export type MiddlewareHandler = (c: Context, next: Next) => Promise<Response | void>

/** Answers for an Error a handler threw, as Hono's app.onError() does. */
export type ErrorHandler = (err: Error, c: Context) => Response | Promise<Response>

/** Answers for a request the chain left unanswered, as Hono's app.notFound() does. */
export type NotFoundHandler = (c: Context) => Response | Promise<Response>

/** The request as the middleware sees it: the parts of Hono's HonoRequest. */
export interface HonyRequest {
    /** The web-standard Request. */
    raw: Request

    method: string

    url: string
    /** The path alone, percent-decoded in full, so a file's name arrives as it is on disk. */
    path: string

    header(name: string): string | undefined

    text(): Promise<string>
}

/**
 * What one request carries through the chain: the request, and the
 * Response once some middleware has answered. An interface, not a class,
 * so that a Hono Context, which has all of this, fits it as it is.
 */
export interface Context extends ContextLike {
    req: HonyRequest

    /** The Response so far; setting one finalizes the context. */
    res: Response

    /** True once a Response is set; the rest of the chain leaves it be. */
    finalized: boolean

    body(data: BodyInit | null, status?: number, headers?: Record<string, string>): Response

    /** May come as a promise, as Hono's does. */
    html(html: string, status?: number, headers?: Record<string, string>): Response | Promise<Response>

    /** May come as a promise, as Hono's does. */
    notFound(): Response | Promise<Response>
}

export interface ContextLike {
    req: {
        method: string
        path: string
        text(): Promise<string>
    }

    body(data: null, status?: number, headers?: Record<string, string>): Response
}

// Decoded once and in full, unlike Hono, which leaves a reserved character
// such as "#" or "+" encoded: the pages refer to a file by its encoded name,
// and this is where that name has to come back as it is on disk. A malformed
// escape leaves the path as it came, to match nothing.
const decodePath = (pathname: string): string => {
    try {
        return decodeURIComponent(pathname)
    } catch {
        return pathname
    }
}

/**
 * The Context for one request, with no Response yet.
 */
export const createContext = (request: Request): Context => {
    const {pathname} = new URL(request.url)
    let res: Response | null = null
    const body = (data: BodyInit | null, status = 200, headers: Record<string, string> = {}): Response => new Response(data, {status, headers})
    return {
        req: {
            raw: request,
            method: request.method,
            url: request.url,
            path: decodePath(pathname),
            header: name => request.headers.get(name) ?? undefined,
            text: () => request.text(),
        },
        finalized: false,
        get res(): Response {
            return res ?? new Response(null)
        },
        set res(value: Response) {
            res = value
            this.finalized = true
        },
        body,
        html: (html, status = 200, headers = {}) => body(html, status, {"content-type": "text/html; charset=utf-8", ...headers}),
        notFound: () => body(null, 404),
    }
}

/**
 * Chains middleware into one: each runs in turn until one answers, and the
 * chain's own next() follows the last. Calling next() twice is an error.
 * With onError and onNotFound, an Error thrown and a request left unanswered
 * become Responses inside the chain, where a middleware outside sees them.
 */
export const compose = (handlers: MiddlewareHandler[], onError?: ErrorHandler, onNotFound?: NotFoundHandler): MiddlewareHandler => (c, next) => {
    let index = -1
    const dispatch = async (i: number): Promise<void> => {
        if (i <= index) throw new Error("next() called multiple times")
        index = i
        const handler = handlers[i]
        let res: Response | void = undefined
        let isError = false
        if (handler != null) {
            try {
                res = await handler(c, () => dispatch(i + 1))
            } catch (error) {
                if (onError == null || !(error instanceof Error)) throw error
                res = await onError(error, c)
                isError = true
            }
        } else {
            await next()
            if (!c.finalized && onNotFound != null) res = await onNotFound(c)
        }
        // An error's answer stands even over one already given, as in Hono.
        if (res != null && (!c.finalized || isError)) c.res = res
    }
    return dispatch(0)
}

/**
 * Runs `handler` as a chain of its own: its next() ends there, so what
 * wraps inside it, a middleware that looks at the Response after next(),
 * sees only what the chain itself answered. What it leaves unanswered
 * goes on to the next middleware outside, past those wrappers.
 */
export const scoped = (handler: MiddlewareHandler): MiddlewareHandler => async (c, next) => {
    const res = await handler(c, async () => undefined)
    if (res != null && !c.finalized) c.res = res
    if (!c.finalized) return next()
}
