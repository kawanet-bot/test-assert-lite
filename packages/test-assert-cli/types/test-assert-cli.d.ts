// Declarations for the test-assert-cli package, hand-written like the
// library's own, so the built bundle needs no emitted types.

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
    /** The executable's own names: the command for the usage, the package and its version for -v. Default: this package's. */
    program?: Program
    /** Locks the run to a WebDriver server. --serve is refused then. */
    webdriver?: boolean
    /** Locks the run to this Playwright browser type, which the caller imports. --serve is refused then. */
    playwright?: BrowserType
}

export interface Program {
    command: string
    name: string
    version: string
}

/** A Playwright browser type, such as chromium from the playwright module. */
export interface BrowserType {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch(options?: object): Promise<unknown>
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp */
    connectOverCDP(endpointURL: string, options?: object): Promise<unknown>
}

/**
 * Runs the command line and resolves to its exit code. It rejects with
 * an error it cannot handle. The caller ends the process. Call it once per process.
 */
export declare function CLI(options: CLIOptions): Promise<number>
