import type {Browser, BrowserType, ConnectOverCDPOptions, Page} from "playwright-core"
import type {Imports, NodeImports} from "./imports.ts"

/** The request body of POST /session for WebDriver. */
export interface WebDriverConfig {
    /** @see https://w3c.github.io/webdriver/#new-session */
    capabilities?: object
}

export interface PlaywrightConfig {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch?: Parameters<BrowserType["launch"]>[0]
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp */
    connectOverCDP?: string | [string, ConnectOverCDPOptions]
    /** @see https://playwright.dev/docs/api/class-browser#browser-new-context */
    newContext?: Parameters<Browser["newContext"]>[0]
    /** @see https://playwright.dev/docs/api/class-browser#browser-new-page */
    newPage?: Parameters<Browser["newPage"]>[0]
    /** @see https://playwright.dev/docs/api/class-page#page-goto */
    goto?: Parameters<Page["goto"]>[1]
}

/** A mode the executable fixes ahead of the arguments. --serve is refused then, and the mode's own flags apply. */
export interface FixedMode {
    /** The run goes through a WebDriver server. */
    webdriver?: boolean
    /** The run goes through this Playwright engine, imported by the caller. */
    playwright?: BrowserType
}

export interface SessionConfig {
    /** The reporter named on the command line; spec unless given. */
    reporter?: string
    /** How much less to say, as the session takes it. */
    quiet?: number
}

interface TestModeOptions {
    /** Option parameters for connect() method. */
    connect?: ConnectConfig
    /** Option parameters for session() method. */
    session?: SessionConfig
    /** The test files to import, in order: paths under Node, served URLs in a page. */
    files: string[]
    /** A script given on the command line, run in place of test files. */
    eval?: string
}

export interface ConnectConfig {
    /** The arguments as given, test files included, for a script to read past argv[0]. */
    argv: string[]
}

export interface NodeModeOptions extends TestModeOptions {
    /** From --import-map then --alias, a later item over an earlier one of the same specifier. */
    imports: NodeImports
}

export interface WebModeOptions extends TestModeOptions {
    /** From --import-map then --alias, a later item over an earlier one of the same specifier. */
    imports: Imports
    /** Classic scripts to run first, absolute, in order. */
    scripts: string[]
    /** What the root serves in place of htdocs: an absolute directory, or an http(s) URL ending in "/". */
    mount?: string
    host?: string
    port?: number
    origin?: string
}

export type ModeOptions =
    | {mode: "help"}
    | {mode: "version"}
    | NodeModeOptions & {mode: "node"}
    | WebModeOptions & {mode: "serve"}
    | WebModeOptions & {mode: "playwright", browserType: BrowserType, custom?: PlaywrightConfig}
    | WebModeOptions & {mode: "webdriver", endpoint?: string, custom?: WebDriverConfig}
