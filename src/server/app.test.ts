import {strict as assert} from "node:assert"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {after, before, describe, it} from "node:test"
import type {App} from "./app.ts"
import {createApp} from "./app.ts"
import type {Server} from "./serve.ts"
import {serve} from "./serve.ts"

// fetch() will do here: every URL below is well-formed, and what the
// server has to refuse is the server's own tests' concern.
const get = async (url: string): Promise<{status: number, type: string, body: string}> => {
    const res = await fetch(url)
    return {status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text()}
}

const post = async (url: string, body: string): Promise<number> => (await fetch(url, {method: "POST", body})).status

describe("server/app", () => {
    let dir: string
    let app: App
    let server: Server
    const stdout: string[] = []
    const url = (path: string): string => server.origin + path

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), "tal-app-"))
        await mkdir(join(dir, "tests", "nested"), {recursive: true})
        await mkdir(join(dir, "lib"))
        await writeFile(join(dir, "tests", "my suite.mjs"), "export const suite = 1")
        await writeFile(join(dir, "tests", "nested", "dep.mjs"), "export const dep = 1")
        await writeFile(join(dir, "tests", "setup.js"), "globalThis.setup = 1")
        await writeFile(join(dir, "lib", "mod.mjs"), "export const mod = 1")
        await writeFile(join(dir, "secret.json"), "{}")
        app = createApp({
            file: join(dir, "tests", "my suite.mjs"),
            scripts: [join(dir, "tests", "setup.js")],
            aliases: [{specifier: "mod", file: join(dir, "lib", "mod.mjs")}],
            stdout: text => stdout.push(text),
        })
        server = await serve({handler: app.handler})
    })

    after(async () => {
        app.close()
        server.close()
        await rm(dir, {recursive: true, force: true})
    })

    it("serves the index page at the root, the map and the tags at the end of its head", async () => {
        const res = await get(url("/"))
        assert.equal(res.status, 200)
        assert.equal(res.type, "text/html; charset=utf-8")
        const head = res.body.slice(0, res.body.indexOf("</head>"))
        const at = (text: string): number => {
            const i = head.indexOf(text)
            assert.notEqual(i, -1, text)
            return i
        }
        const map = at('<script type="importmap">')
        const iife = at('<script src="/@tal/dist/test-assert-lite.min.js"></script>')
        const script = at('<script src="/@tal/scripts/0/setup.js"></script>')
        const suite = at('<script type="module" src="/@tal/tests/0/my%20suite.mjs"></script>')
        assert.ok(map < iife && iife < script && script < suite)
        const {imports} = JSON.parse(head.slice(head.indexOf("{", map), head.indexOf("</script>", map)))
        assert.equal(imports["node:test"], "/@tal/exports/test.mjs")
        assert.equal(imports["test-assert-lite"], "/@tal/dist/test-assert-lite.mjs")
        assert.equal(imports["mod"], "/@tal/aliases/0/mod.mjs")
        assert.equal((await get(url("/index.html"))).body, res.body)
    })

    it("serves the run page under the run's path alone", async () => {
        assert.match(app.page, /^\/@tal\/run\/[0-9a-z]{9}\/run\.html$/)
        const res = await get(url(app.page))
        assert.equal(res.status, 200)
        assert.match(res.body, /reporter\.client/)
        assert.ok(res.body.includes('<script type="module" src="/@tal/tests/0/my%20suite.mjs"></script>\n</head>'))
        assert.equal((await get(url("/run.html"))).status, 404)
        assert.equal((await get(url("/@tal/run/000000000/run.html"))).status, 404)
    })

    it("mounts the suite's directory, each script by name and an alias's directory", async () => {
        assert.equal((await get(url("/@tal/tests/0/my%20suite.mjs"))).body, "export const suite = 1")
        assert.equal((await get(url("/@tal/tests/0/nested/dep.mjs"))).status, 200)
        assert.equal((await get(url("/@tal/scripts/0/setup.js"))).body, "globalThis.setup = 1")
        assert.equal((await get(url("/@tal/scripts/0/my%20suite.mjs"))).status, 404)
        assert.equal((await get(url("/@tal/aliases/0/mod.mjs"))).status, 200)
        assert.equal((await get(url("/@tal/aliases/0/secret.json"))).status, 404)
    })

    it("serves the package's build, bridges and document root, the ESM build as the IIFE's shim", async () => {
        assert.equal((await get(url("/@tal/dist/test-assert-lite.min.js"))).status, 200)
        assert.match((await get(url("/@tal/dist/test-assert-lite.mjs"))).body, /globalThis\.TAL/)
        assert.equal((await get(url("/@tal/exports/test.mjs"))).status, 200)
        assert.equal((await get(url("/@tal/exports/assert/strict.mjs"))).status, 200)
        assert.equal((await get(url("/styles/test-assert-lite.css"))).type, "text/css; charset=utf-8")
        assert.equal((await get(url("/favicon.svg"))).status, 200)
        assert.equal((await get(url("/package.json"))).status, 404)
        assert.equal((await get(url("/@tal/"))).status, 404)
    })

    it("takes the run's reports by POST under its path, and the verdict from end", async () => {
        const run = app.page.slice(0, -"run.html".length)
        assert.equal(await post(url(`${run}begin`), ""), 204)
        assert.equal(await post(url(`${run}stdout`), "one\n"), 204)
        assert.deepEqual(stdout, ["one\n"])
        assert.equal((await get(url(`${run}stdout`))).status, 405)
        assert.equal(await post(url(`${run}nothing`), ""), 404)
        assert.equal(await post(url("/index.html"), ""), 405)
        assert.equal(await post(url(`${run}end`), "true"), 204)
        assert.equal(await app.done, true)
    })

    it("fails the verdict on anything but true", async () => {
        const other = createApp({file: join(dir, "tests", "my suite.mjs"), stdout: () => undefined})
        const running = await serve({handler: other.handler})
        try {
            assert.equal(await post(running.origin + other.page.replace(/run\.html$/, "end"), "yes"), 204)
            assert.equal(await other.done, false)
        } finally {
            other.close()
            running.close()
        }
    })
})
