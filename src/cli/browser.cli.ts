// Browser counterpart of test-assert-lite.cli.ts. The suites are ES modules
// importing node:test, node:assert or the package name, so they are served
// over a loopback HTTP server whose page carries an import map pointing
// all three at the ESM build (htdocs/console.html), then run in Chromium
// through browser/playwright.mjs, the only file that touches Playwright.

import {readFileSync} from "node:fs"
import {basename, dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {parseArgs} from "node:util"
import {runInBrowser} from "../../browser/playwright.mjs"
import {startServer} from "./server.ts"

// One suite per run: several entries would each get their own mount, and
// a module shared between them would load once per mount as a separate
// instance. Bundle first, as the project's own suites are.
const USAGE = "Usage: node src/cli/browser.cli.ts [--serve] [--script <file>]... [--alias <specifier>=<file>]... <file>\n"

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)))

// parseArgs settles the flag forms (--x=v, -h, --) and rejects a flag this
// CLI does not know rather than taking it for a file name; its wording on
// such an error gives way to the usage line. --script names a classic
// script to run before the suite, such as a library's IIFE build whose
// global the suite's bridge reads; repeat it in the order the page needs.
// --alias points a bare specifier the suite imports at an ES module file,
// as rollup's alias plugin does at build time, through the import map.
const parse = () => {
    try {
        return parseArgs({
            args: process.argv.slice(2),
            options: {
                serve: {type: "boolean", default: false},
                script: {type: "string", multiple: true, default: []},
                alias: {type: "string", multiple: true, default: []},
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

// Each --alias is `<specifier>=<file>`, split at the first "=".
const aliases = values.alias.map(entry => {
    const at = entry.indexOf("=")
    if (at < 1 || at === entry.length - 1) {
        process.stderr.write(USAGE)
        process.exit(1)
    }
    return {specifier: entry.slice(0, at), file: resolve(entry.slice(at + 1))}
})

// The suite's directory is mounted at /@tal/tests/0/, so a sibling or a
// nested import resolves beside it while nothing above stays reachable; an
// aliased module gets the same under /@tal/aliases/<n>/, as it may import
// beside itself too. A script cannot, so each is mounted on its own. Names are
// percent-encoded so the URL matches what the browser sends back.
const file = resolve(files[0] as string)
const urls = [`/@tal/tests/0/${encodeURIComponent(basename(file))}`]
const scripts = values.script.map(script => resolve(script))
const scriptUrls = scripts.map((script, i) => `/@tal/scripts/${i}/${encodeURIComponent(basename(script))}`)
const aliasDirs = aliases.map((_, i) => `/@tal/aliases/${i}/`)
const aliasUrls = aliases.map(({file}, i) => `${aliasDirs[i]}${encodeURIComponent(basename(file))}`)

// The pages carry a static import map, and a map can only be inline and
// cannot change once a module has loaded, so with --alias present the
// pages are served with the map extended; the rest of the page is served
// as it is on disk.
const withAliases = (page: string): string => {
    const html = readFileSync(resolve(root, "htdocs", page), "utf8")
    return html.replace(/(<script type="importmap">)([^]*?)(<\/script>)/, (_, open, json, close) => {
        const map = JSON.parse(json) as {imports: Record<string, string>}
        for (const [i, {specifier}] of aliases.entries()) map.imports[specifier] = aliasUrls[i] as string
        return `${open}\n${JSON.stringify(map, null, 4)}\n${close}`
    })
}
const pages = aliases.length ? ["console.html", "index.html"] : []

// Document root is htdocs/, with /dist and /exports aliased onto the build
// output and the subpath bridges, which have to stay where the package
// puts them. Nothing else is exposed. index.html asks for both lists and
// loads them itself, scripts first.
const server = await startServer({
    root: resolve(root, "htdocs"),
    aliases: {
        "/dist/": resolve(root, "dist"),
        "/exports/": resolve(root, "exports"),
        "/@tal/tests/0/": dirname(file),
        ...Object.fromEntries(aliasDirs.map((dir, i) => [dir, dirname(aliases[i]?.file as string)])),
    },
    files: Object.fromEntries(scriptUrls.map((url, i) => [url, scripts[i] as string])),
    data: {
        "/@tal/scripts.json": {type: "application/json", body: JSON.stringify(scriptUrls)},
        "/@tal/tests.json": {type: "application/json", body: JSON.stringify(urls)},
        ...Object.fromEntries(pages.flatMap(page => {
            const body = {type: "text/html", body: withAliases(page)}
            return page === "index.html" ? [[`/${page}`, body], ["/", body]] : [[`/${page}`, body]]
        })),
    },
})

const run = async (): Promise<void> => {
    try {
        const {counts, success} = await runInBrowser({origin: server.origin, scripts: scriptUrls, urls})
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
