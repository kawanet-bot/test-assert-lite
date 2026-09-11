// The command line's arguments, read apart from what runs them: the flags
// as parseArgs settles them, the rules each mode brings, and the form a
// value has to take. Anything wrong is a UsageError from here, before the
// caller has opened a server or a watch on the strength of it.

import {resolve} from "node:path"
import {parseArgs} from "node:util"

export const USAGE = `Usage: test-assert [options] <file...>
  --serve                     serve the suite for a browser and print the URL; the page reloads on a change
  --host <address>            address the server listens on (browser modes, default: 127.0.0.1)
  --port <number>             port the server listens on (browser modes, default: a free one)
  --origin <url>              what the browser reaches the server as, http(s)://host[:port] (browser modes, default: from --host)
  --alias <specifier>=<file>  ES module a bare specifier resolves to (browser modes, repeatable)
  --script <file>             classic script to run first (browser modes, repeatable)
  --mount <dir|url>           what the root serves instead of htdocs: a directory, or an origin to proxy (browser modes)
  --webdriver                 run the suite through a WebDriver server: safaridriver, chromedriver
  --webdriver-session <file>  JSON sent as the body of POST /session (default: no capabilities)
  --endpoint <url>            the WebDriver server (default: http://127.0.0.1:4444)
  --playwright <browser>      run the suite through Playwright: chromium, firefox or webkit
`

// Wrong arguments end in the usage text and exit code 1, after the reason
// when there is one to give.
export class UsageError extends Error {
}

const BROWSERS = ["chromium", "firefox", "webkit"] as const
export type Browser = typeof BROWSERS[number]

export interface Alias {
    specifier: string
    /** The ES module the specifier resolves to, absolute. */
    file: string
}

// What the three browser modes share: one suite, what the page is made
// of, and where the server sits. --serve with --mount may go without a
// suite: the mounted pages carry the library then, and whatever they run.
export interface BrowserOptions {
    /** The suite, absolute; none only under --serve with --mount. */
    file?: string
    /** Classic scripts to run first, absolute, in order. */
    scripts: string[]
    aliases: Alias[]
    /** What the root serves in place of htdocs: an absolute directory, or an http(s) URL ending in "/". */
    mount?: string
    host?: string
    port?: number
    origin?: string
}

export type Options =
    | {mode: "help"}
    | {mode: "node", files: string[]}
    | BrowserOptions & {mode: "serve"}
    | BrowserOptions & {mode: "playwright", browser: Browser}
    | BrowserOptions & {mode: "webdriver", session?: string, endpoint: string}

// A port is a whole number a socket can take.
export const portOf = (value: string): number => {
    const port = Number(value)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new UsageError(`--port takes a number from 0 to 65535: ${value}`)
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

// Each --alias is `<specifier>=<file>`, split at the first "=".
export const aliasOf = (entry: string): Alias => {
    const at = entry.indexOf("=")
    if (at < 1 || at === entry.length - 1) throw new UsageError(`--alias takes <specifier>=<file>: ${entry}`)
    return {specifier: entry.slice(0, at), file: resolve(entry.slice(at + 1))}
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

export const browserOf = (name: string): Browser => {
    if (!(BROWSERS as readonly string[]).includes(name)) throw new UsageError(`--playwright takes chromium, firefox or webkit: ${name}`)
    return name as Browser
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
                port: {type: "string"},
                origin: {type: "string"},
                alias: {type: "string", multiple: true, default: []},
                script: {type: "string", multiple: true, default: []},
                mount: {type: "string"},
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

/**
 * Reads the arguments as the executable gets them and returns what the
 * mode they name needs, every value checked and every path absolute, or
 * throws UsageError with the reason when there is one to give.
 */
export const readOptions = (args: string[]): Options => {
    const {values, positionals: files} = parse(args)
    if (values.help) return {mode: "help"}

    // A browser run takes one suite: several entries would each get their
    // own mount, and a module shared between them would load once per
    // mount as a separate instance. Bundle first, as this package's are.
    const {playwright, webdriver, serve} = values
    const browser = playwright == null ? undefined : browserOf(playwright)
    const browsing = browser != null || webdriver || serve
    if ((browser != null ? 1 : 0) + (webdriver ? 1 : 0) + (serve ? 1 : 0) > 1) {
        throw new UsageError("--playwright, --webdriver and --serve are exclusive")
    }
    if (!browsing && (values.script.length || values.alias.length || values.mount != null || values.host != null || values.port != null || values.origin != null)) {
        throw new UsageError("--host, --port, --origin, --alias, --script and --mount apply to --playwright, --webdriver and --serve only")
    }
    if (!webdriver && (values["webdriver-session"] != null || values.endpoint != null)) {
        throw new UsageError("--webdriver-session and --endpoint apply to --webdriver only")
    }
    const optional = serve && values.mount != null
    if (browsing ? files.length > 1 || (!files.length && !optional) : !files.length) throw new UsageError()

    if (!browsing) {
        // The resolve hook only sees ESM resolution; a require() bypasses
        // it and registers with Node's own runner. Suites are ES modules,
        // so refuse the extensions that can only be CommonJS up front.
        const commonjs = files.filter(file => /\.c[jt]s$/.test(file))
        if (commonjs.length) throw new UsageError(`CommonJS suites are not supported: ${commonjs.join(", ")}`)
        return {mode: "node", files: files.map(file => resolve(file))}
    }

    const shared: BrowserOptions = {
        file: files[0] == null ? undefined : resolve(files[0]),
        scripts: values.script.map(script => resolve(script)),
        aliases: values.alias.map(aliasOf),
        mount: values.mount == null ? undefined : mountOf(values.mount),
        host: values.host,
        port: values.port == null ? undefined : portOf(values.port),
        origin: values.origin == null ? undefined : originOf(values.origin),
    }
    if (browser != null) return {...shared, mode: "playwright", browser}
    if (webdriver) return {...shared, mode: "webdriver", session: values["webdriver-session"], endpoint: values.endpoint ?? "http://127.0.0.1:4444"}
    return {...shared, mode: "serve"}
}
