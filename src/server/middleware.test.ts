import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {Context} from "./middleware.ts"
import {compose, createContext} from "./middleware.ts"

const context = (url = "http://127.0.0.1/"): Context => createContext(new Request(url))

describe("server/middleware", () => {
    describe("Context", () => {
        it("takes the path from the URL, decoded as Hono decodes it", () => {
            const c = context("http://127.0.0.1/a%20b%2Fc?q=1")
            assert.equal(c.req.method, "GET")
            assert.equal(c.req.url, "http://127.0.0.1/a%20b%2Fc?q=1")
            assert.equal(c.req.path, "/a b%2Fc")
            assert.equal(context("http://127.0.0.1/%zz").req.path, "/%zz")
        })

        it("answers with a Response, and is finalized once one is set", async () => {
            const c = context()
            assert.equal(c.finalized, false)
            assert.equal(c.res.status, 200)
            const res = await c.html("<p>hi</p>", 201, {"x-extra": "1"})
            assert.equal(res.status, 201)
            assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8")
            assert.equal(res.headers.get("x-extra"), "1")
            assert.equal((await c.notFound()).status, 404)
            c.res = res
            assert.equal(c.finalized, true)
            assert.equal(c.res, res)
        })

        it("reads a header and the body from the request", async () => {
            const c = createContext(new Request("http://127.0.0.1/", {method: "POST", headers: {"x-run": "1"}, body: "text"}))
            assert.equal(c.req.header("X-Run"), "1")
            assert.equal(c.req.header("x-none"), undefined)
            assert.equal(await c.req.text(), "text")
        })
    })

    describe("compose", () => {
        it("runs the chain in order, and the first Response is the answer", async () => {
            const order: string[] = []
            const c = context()
            await compose([
                async (_, next) => {
                    order.push("a")
                    await next()
                    order.push("a:after")
                },
                async c => {
                    order.push("b")
                    return c.body("b")
                },
                async () => {
                    order.push("never")
                },
            ])(c, async () => {
                order.push("never")
            })
            assert.deepEqual(order, ["a", "b", "a:after"])
            assert.equal(await c.res.text(), "b")
        })

        it("hands on to its own next() past the last, so chains nest", async () => {
            const c = context()
            const outer = compose([compose([async (_, next) => next()]), async c => c.body("outer")])
            await outer(c, async () => undefined)
            assert.equal(await c.res.text(), "outer")
            const empty = context()
            await compose([])(empty, async () => {
                empty.res = empty.body("end")
            })
            assert.equal(await empty.res.text(), "end")
        })

        it("refuses next() called twice", async () => {
            await assert.rejects(compose([async (_, next) => {
                await next()
                await next()
            }])(context(), async () => undefined), /next\(\) called multiple times/)
        })
    })
})
