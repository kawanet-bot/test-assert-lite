// Declarations for the test-assert-cli package, hand-written like the
// library's own, so the built bundle needs no emitted types.

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
    /** The executable's own names. The command for the usage, the package and its version for -v. Default is this package's. */
    program?: Program
    /** Fixes the run on a WebDriver server. --serve is refused then. */
    webdriver?: boolean
    /** Fixes the run on this Playwright engine, imported by the caller. --serve is refused then. */
    playwright?: BrowserType
}

export interface Program {
    command: string
    name: string
    version: string
}

/** A launcher of one of Playwright's browsers. chromium, firefox or webkit as the playwright module exports them. */
export interface BrowserType {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch(options?: object): Promise<unknown>
}

/**
 * Runs the command line and resolves to its exit code, or rejects with
 * what it could not handle. The process is the executable's to end. One
 * call per process, as the command line is.
 */
export declare function CLI(options: CLIOptions): Promise<number>
