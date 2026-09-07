// Browser counterpart of src/cli/test-assert-lite.cli.ts. The suites are ES
// modules importing node:test, node:assert or the package name, so they are
// served over a loopback HTTP server whose page carries an import map that
// points all three at the ESM build (see htdocs/index.html).

import {chromium} from "playwright"
import {readFile} from "node:fs/promises"
import {createServer} from "node:http"
import {basename, extname, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"

const USAGE = "Usage: node tests.cli.mjs <file...>\n"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))
const index = fileURLToPath(new URL("./htdocs/index.html", import.meta.url))

const TYPES = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".mjs": "text/javascript",
}

const files = process.argv.slice(2)

if (files.includes("-h") || files.includes("--help")) {
    process.stdout.write(USAGE)
    process.exit(0)
}

if (!files.length) {
    process.stderr.write(USAGE)
    process.exit(1)
}

// The given files may live anywhere, so each gets a virtual path; every
// other request maps onto the package root and must stay inside it.
const mounts = new Map(files.map((file, i) => [`/@tests/${i}/${basename(file)}`, resolve(file)]))

const locate = (pathname) => {
    if (pathname === "/") return index
    if (mounts.has(pathname)) return mounts.get(pathname)
    const path = resolve(root, "." + pathname)
    return path.startsWith(root + sep) ? path : null
}

const serve = async (req, res) => {
    const path = locate(new URL(req.url, "http://127.0.0.1").pathname)
    try {
        const body = await readFile(path)
        res.writeHead(200, {"content-type": `${TYPES[extname(path)] ?? "application/octet-stream"}; charset=utf-8`})
        res.end(body)
    } catch {
        res.writeHead(404)
        res.end()
    }
}

// 127.0.0.1 on both ends: `localhost` may resolve to ::1 in the browser
// while the server listens on IPv4 only.
const server = createServer(serve)
await new Promise(listening => server.listen(0, "127.0.0.1", listening))
const origin = `http://127.0.0.1:${server.address().port}`

const run = async () => {
    let browser
    try {
        browser = await chromium.launch()
        const page = await browser.newPage()
        const pageErrors = []
        page.on("pageerror", error => pageErrors.push(error))
        // The default reporter writes to the page console; relay it so the
        // output matches what the Node CLI shows.
        page.on("console", msg => (msg.type() === "error" ? console.error : console.log)(msg.text()))

        await page.goto(`${origin}/`)
        // A url tag resolves once the whole module graph has executed, so
        // run() below cannot overtake the registration; inline content would.
        for (const url of mounts.keys()) {
            await page.addScriptTag({type: "module", url})
        }

        // The suites register into the module instance behind the import
        // map, so run() must come from that same instance. evaluate()
        // resolves to what run() resolved to: no polling and no timeout, a
        // hanging test hangs, the same as in node --test.
        const {counts, success} = await page.evaluate(() => import("test-assert-lite").then(m => m.run()))
        const {failed, tests} = counts

        if (pageErrors.length) {
            throw new AggregateError(pageErrors, "Browser page errors occurred")
        }
        // success rather than the counter: a failure outside a test body,
        // such as a hook that threw, never reaches failed.
        if (!success) {
            throw new Error(`Reported ${failed} failed test(s)`)
        }
        if (!tests) {
            throw new Error("Ran no tests")
        }
    } finally {
        await browser?.close()
        server.close()
        server.closeAllConnections()
    }
}

run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
