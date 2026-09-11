// Puts markup into the head of the HTML a page is served as: what the
// pages need, the import map and the script tags, without naming a page.
// Whatever the rest of the chain answers, this looks at once it has.

import type {MiddlewareHandler} from "./middleware.ts"

/**
 * After the rest of the chain, adds `markup`, or what it returns when it
 * is a function, before the first `</head>` of a 200 text/html Response.
 * A page without a `</head>`, and any other Response, goes out as it came.
 */
export const withHead = (markup: string | (() => string)): MiddlewareHandler => async (c, next) => {
    await next()
    const {status, headers} = c.res
    if (status !== 200 || !headers.get("content-type")?.startsWith("text/html")) return
    const html = await c.res.text()
    // A function for the replacement: a "$" in the markup means nothing then.
    const out = html.replace("</head>", () => `${typeof markup === "function" ? markup() : markup}</head>`)
    c.res = new Response(out, {status, headers})
}
