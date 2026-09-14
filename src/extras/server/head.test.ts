import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {HeadMarkup} from "./head.ts"
import {hasImportMap, withHead} from "./head.ts"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose, createContext} from "./middleware.ts"

const TITLE = "extras/server/head.test.ts"

// Runs `markup` ahead of an answer of `body` with `type`, and gives back
// what came out.
const through = async (markup: string | HeadMarkup | ((html: string, path: string) => string), body: string | null, type?: string, status = 200): Promise<{status: number, type: string | null, body: string}> => {
    const answer: MiddlewareHandler = async c => c.body(body, status, type == null ? {} : {"content-type": type})
    const c = createContext(new Request("http://127.0.0.1/page.html"))
    await compose([withHead(markup), answer])(c, async () => undefined)
    return {status: c.res.status, type: c.res.headers.get("content-type"), body: await c.res.text()}
}

describe(TITLE, () => {
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

    it("hands a function the page's HTML and path", async () => {
        const seen: string[] = []
        const markup = (html: string, path: string): string => {
            seen.push(html, path)
            return "<meta>"
        }
        await through(markup, "<head></head>", "text/html")
        assert.deepEqual(seen, ["<head></head>", "/page.html"])
    })

    it("sees an import map of the page's own, however the tag is written", () => {
        for (const tag of ['<script type="importmap">', "<script type='importmap'>", "<script type=importmap>", '<SCRIPT TYPE = "ImportMap">', '<script id="map" type="importmap">', '<script\n  type="importmap"\n>']) {
            assert.ok(hasImportMap(`<head>${tag}{}</script></head>`), tag)
        }
        for (const tag of ['<script type="module">', '<script type="importmapx">', '<script data-type="importmap">', "<script>", '<meta type="importmap">']) {
            assert.equal(hasImportMap(`<head>${tag}</script></head>`), false, tag)
        }
    })

    // What has to precede every script, the import map, goes ahead of the
    // head's first one, whatever kind it is; a script in the body is no bar.
    it("puts what goes ahead before the first script of the head, and before </head> where there is none", async () => {
        const markup: HeadMarkup = {ahead: "<map>", end: "<end>"}
        assert.equal((await through(markup, '<head><meta><script type="module">1</script><script>2</script></head><body></body>', "text/html")).body, '<head><meta><map><script type="module">1</script><script>2</script><end></head><body></body>')
        assert.equal((await through(markup, "<head><meta><SCRIPT>1</SCRIPT></head>", "text/html")).body, "<head><meta><map><SCRIPT>1</SCRIPT><end></head>")
        assert.equal((await through(markup, "<head><meta></head><body><script>1</script></body>", "text/html")).body, "<head><meta><map><end></head><body><script>1</script></body>")
        assert.equal((await through({end: "<end>"}, "<head><script>1</script></head>", "text/html")).body, "<head><script>1</script><end></head>")
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
