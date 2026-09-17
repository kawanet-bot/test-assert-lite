// Serves a .ts file as JavaScript: Node's own stripTypeScriptTypes on the
// way out, so a browser runs the file as Node does. Where this Node strips
// no types, the file is refused, as it would not run under Node either.

import type {Context, MiddlewareHandler} from "./middleware.ts"

// The file is there, but it cannot be handed out as a module.
const refuse = (c: Context): void => {
    c.res = c.body(null, 422)
}

/**
 * After the rest of the chain, strips the types from a 200 text/typescript
 * Response and sends it as text/javascript. A 422 where this Node strips
 * no types, or where stripping fails on the file. Any other Response goes
 * out as it came.
 */
export const withStrippedTypes = (): MiddlewareHandler => async (c, next) => {
    await next()
    const {status, headers} = c.res
    if (status !== 200 || !headers.get("content-type")?.startsWith("text/typescript")) return
    if (!process.features.typescript) return refuse(c)
    const {stripTypeScriptTypes} = await import("node:module")
    if (stripTypeScriptTypes == null) return refuse(c)
    let js: string
    try {
        js = stripTypeScriptTypes(await c.res.text())
    } catch {
        return refuse(c)
    }
    const out = new Headers(headers)
    out.set("content-type", "text/javascript; charset=utf-8")
    c.res = new Response(js, {status, headers: out})
}
