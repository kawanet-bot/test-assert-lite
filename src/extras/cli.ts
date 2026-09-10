// The command line as a function. By default the suites run in this Node
// process; --playwright runs them in one of Playwright's headless browsers,
// --webdriver in whatever browser a WebDriver server drives, and --serve
// hands the same page to a person. Directory search and glob
// expansion are left to the shell: only explicit file names are accepted.

import {readFileSync} from "node:fs"
import {resolve} from "node:path"
import {parseArgs} from "node:util"
import {startApp} from "./app.ts"
import {runInNode} from "./node.ts"
import {runInPlaywright} from "./playwright.mjs"
import {runInWebDriver} from "./webdriver.ts"

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
}

const USAGE = `Usage: test-assert [options] <file...>
  --serve                     serve the suite for a browser and print the URL
  --host <address>            address the suite is served on (browser modes, default: 127.0.0.1)
  --alias <specifier>=<file>  ES module a bare specifier resolves to (browser modes, repeatable)
  --script <file>             classic script to run first (browser modes, repeatable)
  --playwright <browser>      run the suite through Playwright: chromium, firefox or webkit
  --webdriver                 run the suite through a WebDriver server: safaridriver, chromedriver
  --webdriver-session <file>  JSON sent as the body of POST /session (default: no capabilities)
  --endpoint <url>            the WebDriver server (default: http://127.0.0.1:4444)
`

const BROWSERS = ["chromium", "firefox", "webkit"] as const
type Browser = typeof BROWSERS[number]
const isBrowser = (name: string): name is Browser => (BROWSERS as readonly string[]).includes(name)

// Wrong arguments end in the usage text and exit code 1, after the reason
// when there is one to give.
class UsageError extends Error {
}

// parseArgs settles the flag forms (--x=v, -h, --) and rejects a flag this
// CLI does not know rather than taking it for a file name; its wording on
// such an error gives way to the usage text.
const parse = (args: string[]) => {
    try {
        return parseArgs({
            args,
            options: {
                serve: {type: "boolean", default: false},
                host: {type: "string"},
                alias: {type: "string", multiple: true, default: []},
                script: {type: "string", multiple: true, default: []},
                playwright: {type: "string"},
                webdriver: {type: "boolean", default: false},
                "webdriver-session": {type: "string"},
                endpoint: {type: "string"},
                help: {type: "boolean", short: "h", default: false},
            },
            allowPositionals: true,
        })
    } catch {
        throw new UsageError()
    }
}

const main = async (args: string[]): Promise<number> => {
    const {values, positionals: files} = parse(args)

    if (values.help) {
        process.stdout.write(USAGE)
        return 0
    }

    // A browser run takes one suite: several entries would each get their
    // own mount, and a module shared between them would load once per
    // mount as a separate instance. Bundle first, as this package's are.
    const {playwright, webdriver} = values
    if (playwright != null && !isBrowser(playwright)) throw new UsageError(`--playwright takes chromium, firefox or webkit: ${playwright}`)
    const browser = playwright != null || webdriver || values.serve
    if ((playwright != null ? 1 : 0) + (webdriver ? 1 : 0) + (values.serve ? 1 : 0) > 1) {
        throw new UsageError("--playwright, --webdriver and --serve are exclusive")
    }
    if (!browser && (values.script.length || values.alias.length || values.host != null)) {
        throw new UsageError("--host, --alias and --script apply to --playwright, --webdriver and --serve only")
    }
    if (!webdriver && (values["webdriver-session"] != null || values.endpoint != null)) {
        throw new UsageError("--webdriver-session and --endpoint apply to --webdriver only")
    }
    if (browser ? files.length !== 1 : !files.length) throw new UsageError()

    if (!browser) {
        // The resolve hook only sees ESM resolution; a require() bypasses
        // it and registers with Node's own runner. Suites are ES modules,
        // so refuse the extensions that can only be CommonJS up front.
        const commonjs = files.filter(file => /\.c[jt]s$/.test(file))
        if (commonjs.length) throw new UsageError(`CommonJS suites are not supported: ${commonjs.join(", ")}`)

        return (await runInNode(files)).success ? 0 : 1
    }

    // Each --alias is `<specifier>=<file>`, split at the first "=".
    const aliases = values.alias.map(entry => {
        const at = entry.indexOf("=")
        if (at < 1 || at === entry.length - 1) throw new UsageError(`--alias takes <specifier>=<file>: ${entry}`)
        return {specifier: entry.slice(0, at), file: resolve(entry.slice(at + 1))}
    })
    const app = await startApp({
        file: resolve(files[0] as string),
        scripts: values.script.map(script => resolve(script)),
        aliases,
        host: values.host,
    })

    if (values.serve) {
        // Only the URL goes to stdout, so it can be piped. The server keeps
        // the process alive until an interrupt, which resolves this.
        process.stdout.write(`${app.origin}/\n`)
        process.stderr.write("Serving the suite; press Ctrl-C to stop.\n")
        await new Promise<void>(stop => process.once("SIGINT", () => stop()))
        app.close()
        return 0
    }

    try {
        const success = webdriver
            ? await runInWebDriver({
                origin: app.origin,
                done: app.done,
                session: values["webdriver-session"] == null ? undefined : readFileSync(values["webdriver-session"], "utf8"),
                endpoint: values.endpoint ?? "http://127.0.0.1:4444",
            })
            : await runInPlaywright({
                origin: app.origin,
                done: app.done,
                browser: playwright as Browser,
            })

        // The exit code alone, as in Node mode and node --test: the summary
        // on stdout already says what failed, and no tests is not a failure.
        return success ? 0 : 1
    } finally {
        app.close()
    }
}

/**
 * Runs the command line with `args` and resolves to its exit code. Writes
 * what the command line writes, and rejects with what it could not handle,
 * but never exits the process: that is the executable's part. Meant for
 * one call per process, as the command line is: Node mode installs a
 * resolve hook that stays, and a suite once loaded is not loaded again.
 */
export const CLI = async ({args}: CLIOptions): Promise<number> => {
    try {
        return await main(args)
    } catch (error: unknown) {
        if (!(error instanceof UsageError)) throw error
        if (error.message) process.stderr.write(`${error.message}\n`)
        process.stderr.write(USAGE)
        return 1
    }
}
