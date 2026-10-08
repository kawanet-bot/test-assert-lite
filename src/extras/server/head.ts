// Puts markup into the head of the HTML a page is served as. The import
// map and the script tags the pages need, without naming a page. The rest
// of the chain answers first, and this looks at the answer.

import type {MiddlewareHandler} from "./middleware.ts"

// A page that carries an import map of its own: browsers differ on a
// second one, so none is added. A regexp is enough to see one; the HTML
// is not parsed. The type is the whole value: importmap-shim and the
// like are not maps to a browser.
const IMPORT_MAP = /<script\b[^>]*\stype\s*=\s*(?:['"]\s*importmap\s*['"]|importmap(?=[\s>]))/i

// The first script of the head, of any kind: an import map has to be in
// place before a module script's imports are resolved, which is as the
// page is parsed, and a classic script may import() as well.
const FIRST_SCRIPT = /<script\b/i

/** Whether the HTML has an import map of its own. */
export const hasImportMap = (html: string): boolean => IMPORT_MAP.test(html)

/**
 * Markup for the head. `ahead` goes before the head's first script, or
 * before `</head>` where the head has none. `end` goes before `</head>`.
 * A string alone is `end`.
 */
export interface HeadMarkup {
    ahead?: string
    end: string
}

type Markup = string | HeadMarkup

/**
 * Adds `markup`, or what it returns for the page's HTML and path, to the
 * head of a 200 text/html Response, at the first `</head>`. A page without
 * one, and any other Response, goes out as it came.
 */
export const withHead = (markup: Markup | ((html: string, path: string) => Markup)): MiddlewareHandler => async (c, next) => {
    await next()
    const {status, headers} = c.res
    if (status !== 200 || !headers.get("content-type")?.startsWith("text/html")) return
    const html = await c.res.text()
    const close = html.indexOf("</head>")
    const given = typeof markup === "function" ? markup(html, c.req.path) : markup
    const {ahead = "", end} = typeof given === "string" ? {end: given} : given
    const script = ahead && close >= 0 ? html.slice(0, close).search(FIRST_SCRIPT) : -1
    const at = script < 0 ? close : script
    const out = close < 0 ? html : html.slice(0, at) + ahead + html.slice(at, close) + end + html.slice(close)
    // The length is the old body's, not this one's.
    const rewritten = new Headers(headers)
    rewritten.delete("content-length")
    c.res = new Response(out, {status, headers: rewritten})
}
