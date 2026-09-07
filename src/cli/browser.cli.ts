// Browser counterpart of test-assert-lite.cli.ts. The suites are ES modules
// importing node:test, node:assert or the package name, so they are served
// over a loopback HTTP server whose page carries an import map pointing
// all three at the ESM build (htdocs/console.html), then run in Chromium
// through browser/playwright.mjs, the only file that touches Playwright.

import {basename, dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {parseArgs} from "node:util"
import {runInBrowser} from "../../browser/playwright.mjs"
import {startServer} from "./server.ts"

// One suite per run: several entries would each get their own mount, and
// a module shared between them would load once per mount as a separate
// instance. Bundle first, as the project's own suites are.
const USAGE = "Usage: node src/cli/browser.cli.ts [--serve] <file>\n"

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)))

// parseArgs settles the flag forms (--x=v, -h, --) and rejects a flag this
// CLI does not know rather than taking it for a file name; its wording on
// such an error gives way to the usage line.
const parse = () => {
    try {
        return parseArgs({
            args: process.argv.slice(2),
            options: {
                serve: {type: "boolean", default: false},
                help: {type: "boolean", short: "h", default: false},
            },
            allowPositionals: true,
        })
    } catch {
        process.stderr.write(USAGE)
        process.exit(1)
    }
}

const {values, positionals: files} = parse()
const serve = values.serve

if (values.help) {
    process.stdout.write(USAGE)
    process.exit(0)
}

if (files.length !== 1) {
    process.stderr.write(USAGE)
    process.exit(1)
}

// The suite's directory is mounted at /@tal/0/, so a sibling or a nested
// import resolves beside it while nothing above stays reachable. The name
// is percent-encoded so the URL matches what the browser sends back for a
// space, a `#` or a non-ASCII character.
const file = resolve(files[0] as string)
const urls = [`/@tal/0/${encodeURIComponent(basename(file))}`]

// Document root is htdocs/, with /dist and /exports aliased onto the build
// output and the subpath bridges, which have to stay where the package
// puts them. Nothing else is exposed. index.html asks for the mount list
// and imports each entry itself.
const server = await startServer({
    root: resolve(root, "htdocs"),
    aliases: {"/dist/": resolve(root, "dist"), "/exports/": resolve(root, "exports"), "/@tal/0/": dirname(file)},
    data: {"/@tal/tests.json": {type: "application/json", body: JSON.stringify(urls)}},
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
