// The command line's arguments, read apart from what runs them: the flags
// as parseArgs settles them, the rules each mode brings, and the form a
// value has to take. Anything wrong is a UsageError from here, before the
// caller has opened a server or a watch on the strength of it.

import {resolve} from "node:path"
import {parseArgs} from "node:util"
import {readJsonFile} from "../utils/read-json.ts"
import {ImportAliasItem, type ImportBase, Imports, NodeImports, cwdURL, readImportMap} from "./imports.ts"
import type {FixedMode, ModeOptions, PlaywrightConfig, SessionConfig, WebDriverConfig, WebModeOptions} from "./mode-options.ts"
import {createFiles} from "./server/files.ts"
import {UsageError} from "./usage-error.ts"

// The usage, for the command that asks. tacli has --serve as its browser
// mode. An executable that fixed one shows that mode's flags in its place.
export const usageOf = (command: string, fixed: FixedMode = {}): string => {
    const free = !fixed.webdriver && fixed.playwright == null
    const lines = [
        `Usage: ${command} [options] [file [arg...]]`,
        "  -v, --version               print this package's version",
        "  -e, --eval <script>         run the script in place of test files",
        "  --test                      every argument is a test file (default: the first alone, the rest the script's argv)",
        "  --alias <specifier>=<file>  what a specifier resolves to: a file, a URL for the page, or a test-assert-lite subpath (repeatable)",
        "  --import-map <file>         JSON import map: a relative address is a file beside it, / and http(s):// go to the page as they are",
        "  --reporter <name>           how the run is reported: spec, tap or html (default: spec)",
        "  -q, --quiet                 show less output while keeping failures",
        free && "  --serve                     serve for a browser and print the URL, with auto reload",
        "  --port <[host:]port>        port the server listens on, and the address ahead of it (browser modes, default: 127.0.0.1:0, a free port)",
        "  --origin <url>              what the browser reaches the server as, http(s)://host[:port] (browser modes, default: from --port)",
        "  --script <file>             classic script to run first (browser modes, repeatable)",
        "  --mount <dir|url>           what the root serves instead of htdocs: a directory, or an origin to proxy (browser modes)",
        fixed.webdriver && "  --webdriver-config <file>   JSON sent as the body of POST /session (default: no capabilities)",
        fixed.webdriver && "  --endpoint <url>            the WebDriver server (default: http://127.0.0.1:4444)",
        fixed.playwright != null && "  --playwright-config <file>  JSON options for Playwright's launch, newPage and goto",
    ]
    return lines.filter(line => line).map(line => `${line}\n`).join("")
}

/** The port --port names, and the address to listen on when one is given ahead of it. */
export interface Listen {
    host?: string
    port: number
}

// A port is a whole number a socket can take, written in decimal: what
// Number() would also read, 0x50 or 1e3 or nothing, is not one. An address
// goes ahead of it, as node's --inspect-port takes one, an IPv6 literal in
// brackets. An empty address is the default.
export const portOf = (value: string): Listen => {
    const error = new UsageError(`--port takes [host:]port, the port from 0 to 65535: ${value}`)
    // The port follows the last colon, or is all of it. The address ahead
    // is an IPv6 literal in brackets, or anything with no colon in it.
    const at = value.lastIndexOf(":")
    const digits = at < 0 ? value : value.slice(at + 1)
    const ahead = at < 0 ? "" : value.slice(0, at)
    if (!/^\d+$/.test(digits) || Number(digits) > 65535) throw error
    const bracketed = /^\[([0-9a-f:.]+)\]$/i.exec(ahead)
    if (bracketed == null && /[[\]:]/.test(ahead)) throw error
    const host = bracketed?.[1] ?? ahead
    return host ? {host, port: Number(digits)} : {port: Number(digits)}
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
// line has the last word.
const importItemsOf = (mapFile: string | undefined, aliases: string[]): ImportBase[] =>
    [...(mapFile == null ? [] : readImportMap(resolve(mapFile))), ...aliases.map(entry => new ImportAliasItem(entry, cwdURL()))]

// The items the mode cannot take are refused here, one reason per
// specifier, before anything is served or hooked.
const refused = <T extends Imports | NodeImports>(imports: T): T => {
    const refusals = imports.refusals()
    if (refusals.length) throw new UsageError(refusals.join("\n"))
    return imports
}

// parseArgs settles the flag forms (--x=v, -h, --) and rejects a flag this
// CLI does not know rather than taking it for a file name. What it says
// becomes the reason, ahead of the usage text, in node's own wording. The
// flags of a browser mode other than the one fixed are refused the same way.
const parse = (args: string[], fixed: FixedMode) => {
    const free = !fixed.webdriver && fixed.playwright == null
    const hidden = [
        ...(free ? [] : ["serve"] as const),
        ...(fixed.webdriver ? [] : ["webdriver-config", "endpoint"] as const),
        ...(fixed.playwright != null ? [] : ["playwright-config"] as const),
    ]
    const parsed = parseFlags(args)
    const given = hidden.find(key => parsed.values[key] != null && parsed.values[key] !== false)
    if (given != null) throw new UsageError(`Unknown option '--${given}'`)
    return parsed
}

const parseFlags = (args: string[]) => {
    try {
        return parseArgs({
            args,
            options: {
                serve: {type: "boolean", default: false},
                "webdriver-config": {type: "string"},
                endpoint: {type: "string"},
                "playwright-config": {type: "string"},
                port: {type: "string"},
                origin: {type: "string"},
                alias: {type: "string", multiple: true, default: []},
                "import-map": {type: "string"},
                reporter: {type: "string"},
                quiet: {type: "boolean", short: "q"},
                script: {type: "string", multiple: true, default: []},
                mount: {type: "string"},
                eval: {type: "string", short: "e"},
                test: {type: "boolean", default: false},
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
 * Reads the arguments as the executable gets them into what the mode
 * needs, every value checked and every path absolute, or throws
 * UsageError with the reason. A mode the executable fixed is the mode.
 */
export const readOptions = (args: string[], fixed: FixedMode = {}): ModeOptions => {
    const {values, positionals} = parse(args, fixed)
    if (values.help) return {mode: "help"}
    if (values.version) return {mode: "version"}

    const {serve} = values
    const {webdriver = false, playwright: browserType} = fixed
    const browsing = browserType != null || webdriver || serve
    const webdriverConfig = values["webdriver-config"]
    const playwrightConfig = values["playwright-config"]
    const {eval: script} = values

    // The two an executable can fix are the executable's to keep apart.
    if (webdriver && browserType != null) {
        throw new Error("webdriver and playwright are exclusive")
    }
    if (!browsing && (values.script.length || values.mount != null || values.port != null || values.origin != null)) {
        throw new UsageError("--port, --origin, --script and --mount apply to --serve only")
    }
    // The arguments past the script are the script's, as node has it. With
    // --test every one is a test file, as node --test reads them.
    const test = values.test
    let files = test ? positionals : (script == null ? positionals.slice(0, 1) : [])
    const argv = positionals
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

    const items = importItemsOf(values["import-map"], values.alias)

    files = files.map(file => resolve(file))

    const session: SessionConfig = {
        reporter: values.reporter,
        // Ten for -q, so it stands over the rest. A test runner's run says one more than a script's.
        quiet: (values.quiet ? 10 : 0) + (values.test ? -1 : 0),
    }

    if (!browsing) {
        return {
            mode: "node",
            imports: refused(new NodeImports(items)),
            session,
            files,
            eval: script,
            connect: {argv},
        }
    }

    const imports = refused(new Imports(items))

    const scripts = values.script.map(script => resolve(script))

    // The test files are served from one directory, so a module they share is
    // one URL and loads once, as under Node; from two, it would load once
    // per directory. One under another counts as served from the latter.
    const served = createFiles([...(files), ...scripts, ...imports.files()])
    if (new Set(files.map(file => served.dirOf(file))).size > 1) {
        throw new UsageError("a browser run takes the test files from one directory")
    }

    const listen = values.port == null ? undefined : portOf(values.port)
    const shared: WebModeOptions = {
        session,
        files,
        eval: script,
        connect: {argv},
        scripts,
        imports,
        mount: values.mount == null ? undefined : mountOf(values.mount),
        host: listen?.host,
        port: listen?.port,
        origin: values.origin == null ? undefined : originOf(values.origin),
    }
    if (browserType != null) {
        const custom = !playwrightConfig ? undefined : readJsonFile<PlaywrightConfig>(playwrightConfig, msg => new UsageError(`--playwright-config: ${msg}`))
        return {...shared, mode: "playwright", browserType, custom}
    }

    if (webdriver) {
        const sessionReq = !webdriverConfig ? undefined : readJsonFile<WebDriverConfig>(webdriverConfig, msg => new UsageError(`--webdriver-config: ${msg}`))
        return {...shared, mode: "webdriver", custom: sessionReq, endpoint: values.endpoint}
    }

    return {...shared, mode: "serve"}
}
