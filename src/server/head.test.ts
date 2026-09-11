import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {withHead} from "./head.ts"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose, createContext} from "./middleware.ts"

// Runs `markup` ahead of an answer of `body` with `type`, and gives back
// what came out.
const through = async (markup: string | (() => string), body: string | null, type?: string, status = 200): Promise<{status: number, type: string | null, body: string}> => {
    const answer: MiddlewareHandler = async c => c.body(body, status, type == null ? {} : {"content-type": type})
    const c = createContext(new Request("http://127.0.0.1/page.html"))
    await compose([withHead(markup), answer])(c, async () => undefined)
    return {status: c.res.status, type: c.res.headers.get("content-type"), body: await c.res.text()}
}

describe("server/head", () => {
    it("puts the markup before the first </head> of an HTML answer", async () => {
        const out = await through("<meta name=x>\n", "<html><head><title>t</title></head><body></body></html>", "text/html; charset=utf-8")
        assert.equal(out.body, "<html><head><title>t</title><meta name=x>\n</head><body></body></html>")
        assert.equal(out.type, "text/html; charset=utf-8")
    })

    it("asks a function for the markup at each answer, and takes a $ in it as it is", async () => {
        let n = 0
        const markup = (): string => `<!-- ${++n} $& $1 -->`
        assert.ok((await through(markup, "<head></head>", "text/html")).body.includes("<!-- 1 $& $1 --></head>"))
        assert.ok((await through(markup, "<head></head>", "text/html")).body.includes("<!-- 2 $& $1 --></head>"))
    })

    it("leaves a page without a </head> as it came", async () => {
        assert.equal((await through("<meta>", "<p>bare</p>", "text/html")).body, "<p>bare</p>")
    })

    it("leaves anything but a 200 text/html answer as it came", async () => {
        assert.equal((await through("<meta>", "<head></head>", "text/plain")).body, "<head></head>")
        assert.equal((await through("<meta>", "<head></head>", "text/html", 404)).body, "<head></head>")
        assert.equal((await through("<meta>", null)).body, "")
    })
})
