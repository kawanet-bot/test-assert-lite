import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {Context, MiddlewareHandler} from "./middleware.ts"
import {compose, createContext, scoped} from "./middleware.ts"

const TITLE = "extras/server/middleware.test.ts"

const context = (url = "http://127.0.0.1/"): Context => createContext(new Request(url))

describe(TITLE, () => {
    describe("Context", () => {
        it("takes the path from the URL, decoded once and in full", () => {
            const c = context("http://127.0.0.1/a%20b%23c%2Bd?q=1")
            assert.equal(c.req.method, "GET")
            assert.equal(c.req.url, "http://127.0.0.1/a%20b%23c%2Bd?q=1")
            assert.equal(c.req.path, "/a b#c+d")
            assert.equal(context("http://127.0.0.1/a%2520b").req.path, "/a%20b")
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

    describe("scoped", () => {
        const stamp = (mark: string): MiddlewareHandler => async (c, next) => {
            await next()
            if (!c.finalized) return
            c.res = c.body(`${await c.res.text()}${mark}`, c.res.status)
        }

        it("keeps a wrapper inside to what its own chain answers", async () => {
            const c = createContext(new Request("http://127.0.0.1/x"))
            await compose([
                scoped(compose([stamp("[inner]"), async (_, next) => next()])),
                async c => c.body("outer"),
            ])(c, async () => undefined)
            assert.equal(await c.res.text(), "outer")
        })

        it("lets what its chain answers through, wrapped", async () => {
            const c = createContext(new Request("http://127.0.0.1/x"))
            await compose([
                scoped(compose([stamp("[inner]"), async c => c.body("mine")])),
                async c => c.body("outer"),
            ])(c, async () => undefined)
            assert.equal(await c.res.text(), "mine[inner]")
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

        it("answers an Error thrown with onError, where the middleware outside sees it", async () => {
            const seen: number[] = []
            const errors: string[] = []
            const c = context()
            await compose([
                async (c, next) => {
                    await next()
                    seen.push(c.res.status)
                },
                async () => {
                    throw new Error("boom")
                },
            ], (err, c) => {
                errors.push(err.message)
                return c.body(null, 500)
            })(c, async () => undefined)
            assert.equal(c.res.status, 500)
            assert.deepEqual(seen, [500])
            assert.deepEqual(errors, ["boom"])
        })

        it("lets onError's answer stand over one already given", async () => {
            const c = context()
            await compose([
                async c => {
                    c.res = c.body("half")
                    throw new Error("after")
                },
            ], (_, c) => c.body(null, 500))(c, async () => undefined)
            assert.equal(c.res.status, 500)
        })

        it("answers what the chain leaves with onNotFound, where the middleware outside sees it", async () => {
            const seen: number[] = []
            const c = context()
            await compose([
                async (c, next) => {
                    await next()
                    seen.push(c.res.status)
                },
                async (_, next) => next(),
            ], undefined, c => c.body(null, 404))(c, async () => undefined)
            assert.equal(c.res.status, 404)
            assert.deepEqual(seen, [404])
            const answered = context()
            await compose([async c => c.body("mine")], undefined, c => c.body(null, 404))(answered, async () => undefined)
            assert.equal(answered.res.status, 200)
        })

        it("lets a throw through without onError, and one that is not an Error with it", async () => {
            await assert.rejects(compose([async () => {
                throw new Error("boom")
            }])(context(), async () => undefined), /boom/)
            await assert.rejects(compose([async () => {
                throw "text"
            }], (_, c) => c.body(null, 500))(context(), async () => undefined), /^text$/)
        })
    })
})
