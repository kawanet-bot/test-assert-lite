import type {Imports} from "./imports.ts"

const ENGINE_NAMES = ["chromium", "firefox", "webkit"] as const
export type EngineName = typeof ENGINE_NAMES[number]

export interface SessionConfigJSON {
    session: SessionConfig
}

/** The request body of POST /session for WebDriver. */
export interface SessionReqJSON {
    capabilities?: object
}

export interface SessionConfig {
    /** The reporter named on the command line; spec unless given. */
    reporter?: string
    /** The test files to import, in order: paths under Node, served URLs in a page. */
    files: string[]
    /** false leaves the counts, the version and the user agent off the report. */
    summary?: boolean
}

interface TestModeOptions {
    session: SessionConfig

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
    | WebModeOptions & {mode: "playwright", engine: EngineName, configJson?: string}
    | WebModeOptions & {mode: "webdriver", endpoint?: string, sessionReq?: SessionReqJSON}

export const isEngineName = (v: unknown): v is EngineName => ENGINE_NAMES.includes(v as EngineName)
