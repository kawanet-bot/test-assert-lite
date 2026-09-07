// Browser counterpart of test-assert-lite.cli.ts. The suites are ES modules
// importing node:test, node:assert or the package name, so they are served
// over a loopback HTTP server whose page carries an import map pointing
// all three at the ESM build (htdocs/console.html), then run in Chromium
// through browser/playwright.mjs, the only file that touches Playwright.

import {basename, dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {runInBrowser} from "../../browser/playwright.mjs"
import {startServer} from "./server.ts"

const USAGE = "Usage: node src/cli/browser.cli.ts [--serve] <file...>\n"

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)))

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

// Each suite's directory is mounted at /@tests/<n>/, so a sibling or a
// nested import resolves beside it while nothing above stays reachable.
// The entry's name is percent-encoded so the URL matches what the
// browser sends back for a space, a `#` or a non-ASCII character.
const suites = files.map((file, i) => ({
    prefix: `/@tests/${i}/`,
    dir: dirname(resolve(file)),
    url: `/@tests/${i}/${encodeURIComponent(basename(file))}`,
}))
const urls = suites.map(suite => suite.url)

// Document root is htdocs/, with /dist aliased onto the build output since
// dist/ has to stay where the package puts it. Nothing else is exposed.
// index.html asks for the mount list and imports each entry itself.
const server = await startServer({
    root: resolve(root, "htdocs"),
    aliases: {"/dist/": resolve(root, "dist"), ...Object.fromEntries(suites.map(suite => [suite.prefix, suite.dir]))},
    data: {"/@tests.json": {type: "application/json", body: JSON.stringify(urls)}},
})

const run = async (): Promise<void> => {
    try {
        const {counts, success} = await runInBrowser({origin: server.origin, urls})
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
    run().catch((error: unknown) => {
        console.error(error)
        process.exitCode = 1
    })
}
