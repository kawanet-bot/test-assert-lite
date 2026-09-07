// Browser counterpart of src/cli/test-assert-lite.cli.ts. The suites are ES
// modules importing node:test, node:assert or the package name, so they are
// served over a loopback HTTP server whose page carries an import map that
// points all three at the ESM build (see htdocs/console.html).

import {basename, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {startServer} from "../src/cli/server.ts"
import {runInBrowser} from "./playwright.mjs"

const USAGE = "Usage: node tests.cli.mjs [--serve] <file...>\n"

const root = resolve(fileURLToPath(new URL("..", import.meta.url)))

const args = process.argv.slice(2)
const serve = args.includes("--serve")
const files = args.filter(arg => arg !== "--serve")

if (args.includes("-h") || args.includes("--help")) {
    process.stdout.write(USAGE)
    process.exit(0)
}

if (!files.length) {
    process.stderr.write(USAGE)
    process.exit(1)
}

// The given files may live anywhere, so each gets a virtual path. The name
// is percent-encoded up front so the key matches what the browser sends
// back for a space, a `#` or a non-ASCII character.
const mounts = Object.fromEntries(files.map((file, i) => [`/@tests/${i}/${encodeURIComponent(basename(file))}`, resolve(file)]))

// Document root is htdocs/, with /dist aliased onto the build output since
// dist/ has to stay where the package puts it. Nothing else is exposed.
// index.html asks for the mount list and imports each entry itself.
const server = await startServer({
    root: resolve(root, "htdocs"),
    aliases: {"/dist/": resolve(root, "dist")},
    files: mounts,
    data: {"/@tests.json": {type: "application/json", body: JSON.stringify(Object.keys(mounts))}},
})

const run = async () => {
    try {
        const {counts, success} = await runInBrowser({origin: server.origin, urls: Object.keys(mounts)})
        const {failed, tests} = counts

        // success rather than the counter: a failure outside a test body,
        // such as a hook that threw, never reaches failed.
        if (!success) {
            throw new Error(`Reported ${failed} failed test(s)`)
        }
        if (!tests) {
            throw new Error("Ran no tests")
        }
    } finally {
        server.close()
    }
}

if (serve) {
    // Hand the page to a person instead of Playwright and stay up until
    // interrupted. Only the URL goes to stdout, so it can be piped.
    process.stdout.write(`${server.origin}/\n`)
    process.stderr.write("Serving the suites; press Ctrl-C to stop.\n")
    process.once("SIGINT", () => server.close())
} else {
    run().catch(error => {
        console.error(error)
        process.exitCode = 1
    })
}
