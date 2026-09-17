import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose, createContext} from "./middleware.ts"
import {withStrippedTypes} from "./typestrip.ts"

const TITLE = "extras/server/typestrip.test.ts"

// Runs the middleware ahead of an answer of `body` with `type`, and gives
// back what came out.
const through = async (body: string | null, type?: string, status = 200): Promise<{status: number, type: string | null, body: string}> => {
    const answer: MiddlewareHandler = async c => c.body(body, status, type == null ? {} : {"content-type": type})
    const c = createContext(new Request("http://127.0.0.1/mod.ts"))
    await compose([withStrippedTypes(), answer])(c, async () => undefined)
    return {status: c.res.status, type: c.res.headers.get("content-type"), body: await c.res.text()}
}

describe(TITLE, () => {
    it("answers 422 where this Node strips no types", async t => {
        if (process.features.typescript) return t.skip()
        assert.equal((await through("export const n: number = 1\n", "text/typescript; charset=utf-8")).status, 422)
    })

    it("strips the types from a text/typescript answer and sends it as text/javascript", async t => {
        if (!process.features.typescript) return t.skip()
        const out = await through("export const n: number = 1\n", "text/typescript; charset=utf-8")
        assert.equal(out.status, 200)
        assert.equal(out.type, "text/javascript; charset=utf-8")
        assert.match(out.body, /^export const n\s*=\s*1\n$/)
        assert.ok(!out.body.includes(":"))
    })

    it("answers 422 where stripping fails on the file", async t => {
        if (!process.features.typescript) return t.skip()
        assert.equal((await through("enum E {A}\n", "text/typescript; charset=utf-8")).status, 422)
    })

    it("leaves anything but a 200 text/typescript answer as it came", async () => {
        assert.equal((await through("const n: number = 1", "text/plain")).body, "const n: number = 1")
        assert.equal((await through("const n: number = 1", "text/typescript", 404)).status, 404)
        assert.equal((await through(null)).status, 200)
    })
})
