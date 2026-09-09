import {strict as assert} from "node:assert"
import {mkdir, mkdtemp, rm, symlink, writeFile} from "node:fs/promises"
import {request} from "node:http"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {after, before, describe, it} from "node:test"
import type {Server} from "./server.ts"
import {startServer} from "./server.ts"

// Raw request: fetch() and the URL parser fold ".." away before sending,
// so the traversal cases below need the path to go out verbatim.
const get = (origin: string, path: string): Promise<{status: number, type: string, body: string}> => new Promise((resolve, reject) => {
    const {hostname, port} = new URL(origin)
    request({hostname, port, path}, res => {
        let body = ""
        res.setEncoding("utf8")
        res.on("data", chunk => (body += chunk))
        res.on("end", () => resolve({status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), body}))
    }).on("error", reject).end()
})

describe("cli/server", () => {
    let dir: string
    let server: Server
    const lines: string[] = []

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), "tal-server-"))
        await mkdir(join(dir, "htdocs"))
        await mkdir(join(dir, "dist"))
        await mkdir(join(dir, "elsewhere"))
        await writeFile(join(dir, "htdocs", "page.html"), "<p>page</p>")
        await writeFile(join(dir, "htdocs", "index.html"), "<p>index</p>")
        await writeFile(join(dir, "dist", "lib.mjs"), "export const lib = 1")
        await writeFile(join(dir, "dist", "my lib.mjs"), "export const lib = 2")
        await mkdir(join(dir, "dist", "nested"))
        await writeFile(join(dir, "dist", "nested", "deep.mjs"), "export const deep = 1")
        await writeFile(join(dir, "dist", "legacy.cjs"), "module.exports = {}")
        await writeFile(join(dir, "dist", "source.ts"), "export const source: number = 1")
        await symlink("..", join(dir, "dist", "up"))
        await symlink("lib.mjs", join(dir, "dist", "alias.mjs"))
        await writeFile(join(dir, "elsewhere", "suite.mjs"), "export const suite = 1")
        await writeFile(join(dir, "secret.json"), "{}")
        server = await startServer({
            root: join(dir, "htdocs"),
            aliases: {"/dist/": join(dir, "dist")},
            files: {"/@tal/tests/0/my%20suite.mjs": join(dir, "elsewhere", "suite.mjs")},
            data: {"/@tal/tests.json": {type: "application/json", body: '["/@tal/tests/0/my%20suite.mjs"]'}},
            log: line => lines.push(line),
        })
    })

    it("decodes a percent-encoded path under an alias, and nested paths", async () => {
        const res = await get(server.origin, "/dist/my%20lib.mjs")
        assert.equal(res.status, 200)
        assert.equal(res.body, "export const lib = 2")
        assert.equal((await get(server.origin, "/dist/nested/deep.mjs")).status, 200)
    })

    it("refuses a kind it does not serve with 403", async () => {
        assert.equal((await get(server.origin, "/dist/legacy.cjs")).status, 403)
        assert.equal((await get(server.origin, "/dist/source.ts")).status, 403)
    })

    it("follows a symlink inside the directory but not one leading out", async () => {
        assert.equal((await get(server.origin, "/dist/alias.mjs")).status, 200)
        assert.equal((await get(server.origin, "/dist/up/secret.json")).status, 404)
    })

    it("refuses a malformed escape and an encoded traversal", async () => {
        assert.equal((await get(server.origin, "/dist/%zz.mjs")).status, 404)
        assert.equal((await get(server.origin, "/dist/%2e%2e/secret.json")).status, 404)
    })

    it("serves an in-memory response", async () => {
        const res = await get(server.origin, "/@tal/tests.json")
        assert.equal(res.status, 200)
        assert.equal(res.type, "application/json; charset=utf-8")
        assert.deepEqual(JSON.parse(res.body), ["/@tal/tests/0/my%20suite.mjs"])
    })

    after(async () => {
        server.close()
        await rm(dir, {recursive: true, force: true})
    })

    it("listens on a loopback port", () => {
        assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/)
    })

    it("serves the document root with a content type", async () => {
        const res = await get(server.origin, "/page.html")
        assert.equal(res.status, 200)
        assert.equal(res.type, "text/html; charset=utf-8")
        assert.equal(res.body, "<p>page</p>")
    })

    it("serves an alias before the root", async () => {
        const res = await get(server.origin, "/dist/lib.mjs")
        assert.equal(res.status, 200)
        assert.equal(res.type, "text/javascript; charset=utf-8")
    })

    it("serves a mounted file by its exact, encoded path", async () => {
        assert.equal((await get(server.origin, "/@tal/tests/0/my%20suite.mjs")).status, 200)
        assert.equal((await get(server.origin, "/@tal/tests/1/other.mjs")).status, 404)
    })

    it("serves index.html for a directory path, and no listing", async () => {
        const res = await get(server.origin, "/")
        assert.equal(res.status, 200)
        assert.equal(res.body, "<p>index</p>")
        assert.equal((await get(server.origin, "/dist/")).status, 404)
    })

    it("refuses to leave the root or an alias", async () => {
        assert.equal((await get(server.origin, "/../secret.json")).status, 404)
        assert.equal((await get(server.origin, "/dist/../secret.json")).status, 404)
        assert.equal((await get(server.origin, "/secret.json")).status, 404)
    })

    it("answers 404 for a missing file", async () => {
        assert.equal((await get(server.origin, "/missing.html")).status, 404)
    })

    it("logs one line per response, in morgan's tiny format", async () => {
        const from = lines.length
        await get(server.origin, "/dist/lib.mjs")
        await get(server.origin, "/missing.html")
        await get(server.origin, "/dist/legacy.cjs")
        assert.deepEqual(lines.slice(from).map(line => line.replace(/ \d+\.\d{3} ms$/, " N ms")), [
            "GET /dist/lib.mjs 200 20 - N ms",
            "GET /missing.html 404 - - N ms",
            "GET /dist/legacy.cjs 403 - - N ms",
        ])
    })
})
