#!/usr/bin/env node

// The test runner. By default the suites run in this Node process;
// --chromium runs them in headless Chromium through Playwright, and
// --serve hands the same page to a person. Directory search and glob
// expansion are left to the shell: only explicit file names are accepted.

import {resolve} from "node:path"
import {parseArgs} from "node:util"
import {startApp} from "./app.ts"
import {runInNode} from "./node.ts"
import {runInBrowser} from "./playwright.mjs"

const USAGE = `Usage: test-assert [options] <file...>
  --chromium                  run the suite in headless Chromium through Playwright
  --serve                     serve the suite for a browser and print the URL
  --script <file>             classic script to run first (browser modes, repeatable)
  --alias <specifier>=<file>  ES module a bare specifier resolves to (browser modes, repeatable)
`

const fail = (message?: string): never => {
    if (message != null) process.stderr.write(`${message}\n`)
    process.stderr.write(USAGE)
    process.exit(1)
}

// parseArgs settles the flag forms (--x=v, -h, --) and rejects a flag this
// CLI does not know rather than taking it for a file name; its wording on
// such an error gives way to the usage text.
const parse = () => {
    try {
        return parseArgs({
            args: process.argv.slice(2),
            options: {
                chromium: {type: "boolean", default: false},
                serve: {type: "boolean", default: false},
                script: {type: "string", multiple: true, default: []},
                alias: {type: "string", multiple: true, default: []},
                help: {type: "boolean", short: "h", default: false},
            },
            allowPositionals: true,
        })
    } catch {
        return fail()
    }
}

const {values, positionals: files} = parse()

if (values.help) {
    process.stdout.write(USAGE)
    process.exit(0)
}

// A browser run takes one suite: several entries would each get their own
// mount, and a module shared between them would load once per mount as a
// separate instance. Bundle first, as the project's own suites are.
const browser = values.chromium || values.serve
if (values.chromium && values.serve) fail("--chromium and --serve are exclusive")
if (!browser && (values.script.length || values.alias.length)) fail("--script and --alias apply to --chromium and --serve only")
if (browser ? files.length !== 1 : !files.length) fail()

if (!browser) {
    // The resolve hook only sees ESM resolution; a require() bypasses it
    // and registers with Node's own runner. Suites are ES modules, so
    // refuse the extensions that can only be CommonJS up front.
    const commonjs = files.filter(file => /\.c[jt]s$/.test(file))
    if (commonjs.length) fail(`CommonJS suites are not supported: ${commonjs.join(", ")}`)

    process.exitCode = (await runInNode(files)).success ? 0 : 1
} else {
    // Each --alias is `<specifier>=<file>`, split at the first "=".
    const aliases = values.alias.map(entry => {
        const at = entry.indexOf("=")
        if (at < 1 || at === entry.length - 1) fail(`--alias takes <specifier>=<file>: ${entry}`)
        return {specifier: entry.slice(0, at), file: resolve(entry.slice(at + 1))}
    })
    const app = await startApp({
        file: resolve(files[0] as string),
        scripts: values.script.map(script => resolve(script)),
        aliases,
    })

    if (values.serve) {
        // Only the URL goes to stdout, so it can be piped. Stays up until
        // interrupted.
        process.stdout.write(`${app.origin}/\n`)
        process.stderr.write("Serving the suite; press Ctrl-C to stop.\n")
        process.once("SIGINT", () => app.close())
    } else {
        try {
            const {counts, success} = await runInBrowser({...app, browser: "chromium"})

            // success rather than the counter: a failure outside a test
            // body, such as a hook that threw, never reaches failed.
            if (!success) throw new Error(`Reported ${counts.failed} failed test(s)`)
            if (!counts.tests) throw new Error("Ran no tests")
        } catch (error: unknown) {
            console.error(error)
            process.exitCode = 1
        } finally {
            app.close()
        }
    }
}
