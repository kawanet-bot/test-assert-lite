// The command line's arguments, read apart from what runs them: the flags
// as parseArgs settles them, the rules each mode brings, and the form a
// value has to take. Anything wrong is a UsageError from here, before the
// caller has opened a server or a watch on the strength of it.

import {resolve} from "node:path"
import {parseArgs} from "node:util"
import {readJsonFile} from "../utils/read-json.ts"
import type {Mode} from "./imports.ts"
import {ImportAliasItem, Imports, cwdURL, readImportMap} from "./imports.ts"
import type {BrowserCustom, EngineName, ModeOptions, TestSession, WebDriverCustom, WebModeOptions} from "./mode-options.ts"
import {isEngineName} from "./mode-options.ts"
import {createFiles} from "./server/files.ts"
import {UsageError} from "./usage-error.ts"

export const USAGE = `Usage: test-assert [options] [file...]
  -v, --version               print this package's version
  -e, --eval <script>         run the script in place of test files
  --alias <specifier>=<file>  what a specifier resolves to: a file, a URL for the page, or this package's own name (repeatable)
  --import-map <file>         JSON import map: a relative address is a file beside it, / and http(s):// go to the page as they are
  --reporter <name>           how the run is reported: spec, tap or html (default: spec)
  -q, --quiet                 only the failures: no summary lines, no line per passing test, an access log of 4xx and 5xx alone
  --serve                     serve for a browser and print the URL, with auto reload
  --host <address>            address the server listens on (browser modes, default: 127.0.0.1)
  --port <number>             port the server listens on (browser modes, default: a free one)
  --origin <url>              what the browser reaches the server as, http(s)://host[:port] (browser modes, default: from --host)
  --script <file>             classic script to run first (browser modes, repeatable)
  --mount <dir|url>           what the root serves instead of htdocs: a directory, or an origin to proxy (browser modes)
  --webdriver                 run the suite through a WebDriver server: safaridriver, chromedriver
  --webdriver-config <file>   JSON sent as the body of POST /session (default: no capabilities)
  --endpoint <url>            the WebDriver server (default: http://127.0.0.1:4444)
  --playwright <browser>      run the suite through Playwright: chromium, firefox or webkit
  --playwright-config <file>  JSON options for Playwright's launch, newPage and goto
`

// A port is a whole number a socket can take, written in decimal: what
// Number() would also read, 0x50 or 1e3 or nothing, is not one.
export const portOf = (value: string): number => {
    const port = Number(value)
    if (!/^\d+$/.test(value) || port > 65535) throw new UsageError(`--port takes a number from 0 to 65535: ${value}`)
    return port
}

// An origin is a URL that is nothing but scheme, host and port, as a
// browser names a server.
export const originOf = (value: string): string => {
    const error = new UsageError(`--origin takes http(s)://host[:port]: ${value}`)
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw error
    }
    if (!/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw error
    return url.origin
}

// A mount is a directory, resolved, or an http(s) URL to proxy, taken
// as given up to its path and made to end in "/" so a request's path
// joins onto it.
export const mountOf = (value: string): string => {
    if (!/^https?:\/\//i.test(value)) return resolve(value)
    let url: URL
    try {
        url = new URL(value)
    } catch {
        throw new UsageError(`--mount takes a directory or http(s)://host[:port][/path]: ${value}`)
    }
    if (url.search || url.hash || url.username || url.password) throw new UsageError(`--mount takes a directory or http(s)://host[:port][/path]: ${value}`)
    return url.href.endsWith("/") ? url.href : `${url.href}/`
}

// The import map's items first and each --alias after, so the command
// line has the last word; what `mode` cannot take of the result is refused
// here, one reason per specifier, before anything is served or hooked.
export const importsOf = (mapFile: string | undefined, aliases: string[], mode: Mode): Imports => {
    const imports = new Imports([...(mapFile == null ? [] : readImportMap(resolve(mapFile))), ...aliases.map(entry => new ImportAliasItem(entry, cwdURL()))])
    const refusals = imports.refusals(mode)
    if (refusals.length) throw new UsageError(refusals.join("\n"))
    return imports
}

export const engineNameOf = (name: string): EngineName => {
    if (!isEngineName(name)) throw new UsageError(`--playwright takes chromium, firefox or webkit: ${name}`)
    return name
}

// parseArgs settles the flag forms (--x=v, -h, --) and rejects a flag this
// CLI does not know rather than taking it for a file name. What it says
// becomes the reason, ahead of the usage text, in node's own wording.
const parse = (args: string[]) => {
    try {
        return parseArgs({
            args,
            options: {
                serve: {type: "boolean", default: false},
                host: {type: "string"},
                port: {type: "string"},
                origin: {type: "string"},
                alias: {type: "string", multiple: true, default: []},
                "import-map": {type: "string"},
                reporter: {type: "string"},
                quiet: {type: "boolean", short: "q"},
                script: {type: "string", multiple: true, default: []},
                mount: {type: "string"},
                playwright: {type: "string"},
                "playwright-config": {type: "string"},
                webdriver: {type: "boolean", default: false},
                "webdriver-config": {type: "string"},
                endpoint: {type: "string"},
                eval: {type: "string", short: "e"},
                help: {type: "boolean", short: "h", default: false},
                version: {type: "boolean", short: "v", default: false},
            },
            allowPositionals: true,
        })
    } catch (error) {
        throw new UsageError(error instanceof Error ? error.message : String(error))
    }
}

/**
 * Reads the arguments as the executable gets them and returns what the
 * mode they name needs, every value checked and every path absolute, or
 * throws UsageError with the reason when there is one to give.
 */
export const readOptions = (args: string[]): ModeOptions => {
    const {values, positionals: files} = parse(args)
    if (values.help) return {mode: "help"}
    if (values.version) return {mode: "version"}

    const {playwright, webdriver, serve} = values
    const engine = playwright == null ? undefined : engineNameOf(playwright)
    const browsing = engine != null || webdriver || serve
    const webdriverConfig = values["webdriver-config"]
    const playwrightConfig = values["playwright-config"]
    const {eval: script} = values

    if ((engine ? 1 : 0) + (webdriver ? 1 : 0) + (serve ? 1 : 0) > 1) {
        throw new UsageError("--playwright, --webdriver and --serve are exclusive")
    }
    if (!browsing && (values.script.length || values.mount != null || values.host != null || values.port != null || values.origin != null)) {
        throw new UsageError("--host, --port, --origin, --script and --mount apply to --playwright, --webdriver and --serve only")
    }
    if (!webdriver && (webdriverConfig != null || values.endpoint != null)) {
        throw new UsageError("--webdriver-config and --endpoint apply to --webdriver only")
    }
    if (!playwright && (values["playwright-config"] != null)) {
        throw new UsageError("--playwright-config applies to --playwright only")
    }
    if (script != null && files.length) {
        throw new UsageError("-e takes the place of the test files")
    }
    if (!serve && !files.length && script == null) {
        throw new UsageError("no test files specified")
    }

    // Suites are ES modules: under Node a require() bypasses the hook and
    // lands on Node's own runner, and a browser has no require at all, so
    // the extensions that can only be CommonJS are refused in both.
    const commonjs = files.filter(file => /\.c[jt]s$/.test(file))
    if (commonjs.length) {
        throw new UsageError(`CommonJS test files are not supported: ${commonjs.join(", ")}`)
    }

    const imports = importsOf(values["import-map"], values.alias, browsing ? "browser" : "node")

    const session: TestSession = {
        files: files.map(file => resolve(file)),
        reporter: values.reporter,
        quiet: values.quiet,
    }

    if (!browsing) return {mode: "node", imports, session, eval: script}

    const scripts = values.script.map(script => resolve(script))

    // The test files are served from one directory, so a module they share is
    // one URL and loads once, as under Node; from two, it would load once
    // per directory. One under another counts as served from the latter.
    const served = createFiles([...(session.files), ...scripts, ...imports.paths()])
    if (new Set(session.files.map(file => served.dirOf(file))).size > 1) {
        throw new UsageError("--playwright, --webdriver and --serve take the test files from one directory")
    }

    const shared: WebModeOptions = {
        session,
        eval: script,
        scripts,
        imports,
        mount: values.mount == null ? undefined : mountOf(values.mount),
        host: values.host,
        port: values.port == null ? undefined : portOf(values.port),
        origin: values.origin == null ? undefined : originOf(values.origin),
    }
    if (engine) {
        const custom = !playwrightConfig ? undefined : readJsonFile<BrowserCustom>(playwrightConfig, msg => new UsageError(`--playwright-config: ${msg}`))
        return {...shared, mode: "playwright", engine, custom}
    }

    if (webdriver) {
        const sessionReq = !webdriverConfig ? undefined : readJsonFile<WebDriverCustom>(webdriverConfig, msg => new UsageError(`--webdriver-config: ${msg}`))
        return {...shared, mode: "webdriver", custom: sessionReq, endpoint: values.endpoint}
    }

    return {...shared, mode: "serve"}
}
