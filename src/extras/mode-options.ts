import type {Imports} from "./imports.ts"

const ENGINE_NAMES = ["chromium", "firefox", "webkit"] as const
export type EngineName = typeof ENGINE_NAMES[number]

/** The request body of POST /session for WebDriver. */
export interface WebDriverCustom {
    /** @see https://w3c.github.io/webdriver/#new-session */
    capabilities?: object
}

export interface BrowserCustom {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch?: object
    /** @see https://playwright.dev/docs/api/class-browser#browser-new-page */
    newPage?: object
    /** @see https://playwright.dev/docs/api/class-page#page-goto */
    goto?: object
}

export interface TestSession {
    /** The reporter named on the command line; spec unless given. */
    reporter?: string
    /** The test files to import, in order: paths under Node, served URLs in a page. */
    files: string[]
    /** false leaves the counts, the version and the user agent off the report. */
    summary?: boolean
}

interface TestModeOptions {
    session: TestSession
    /** A script given on the command line, run in place of test files. */
    eval?: string

    /** From --import-map then --alias, a later item over an earlier one of the same specifier. */
    imports: Imports
}

export interface WebModeOptions extends TestModeOptions {
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
    | TestModeOptions & {mode: "node"}
    | WebModeOptions & {mode: "serve"}
    | WebModeOptions & {mode: "playwright", engine: EngineName, custom?: BrowserCustom}
    | WebModeOptions & {mode: "webdriver", endpoint?: string, custom?: WebDriverCustom}

export const isEngineName = (v: unknown): v is EngineName => ENGINE_NAMES.includes(v as EngineName)
