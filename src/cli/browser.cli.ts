// Browser counterpart of test-assert-lite.cli.ts: turns the arguments into
// what app.ts serves and browser/playwright.mjs runs, and reports the
// outcome. app.ts lays out the loopback server, and playwright.mjs is the
// only file that touches Playwright.

import {resolve} from "node:path"
import {parseArgs} from "node:util"
import {runInBrowser} from "../../browser/playwright.mjs"
import {startApp} from "./app.ts"

// One suite per run: several entries would each get their own mount, and
// a module shared between them would load once per mount as a separate
// instance. Bundle first, as the project's own suites are.
const USAGE = "Usage: node src/cli/browser.cli.ts [--serve] [--script <file>]... [--alias <specifier>=<file>]... <file>\n"

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

const file = resolve(files[0] as string)
const scripts = values.script.map(script => resolve(script))
const app = await startApp({file, scripts, aliases})

const run = async (): Promise<void> => {
    try {
        const {counts, success} = await runInBrowser(app)
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
        app.close()
    }
}

if (serve) {
    // Hand the page to a person instead of Playwright and stay up until
    // interrupted. Only the URL goes to stdout, so it can be piped.
    process.stdout.write(`${app.origin}/\n`)
    process.stderr.write("Serving the suites; press Ctrl-C to stop.\n")
    process.once("SIGINT", () => app.close())
} else {
    run().catch((error: unknown) => {
        console.error(error)
        process.exitCode = 1
    })
}
