// Declarations for the test-assert-cli package, hand-written like the
// library's own, so the built bundle needs no emitted types.

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
    /** What the executable calls itself: the command for the usage, the package and its version for -v. Default: this package's. */
    program?: Program
    /** Fixes the run on a WebDriver server, as --webdriver does. The flags that choose a mode are refused then. */
    webdriver?: boolean
    /** Fixes the run on this Playwright engine, imported by the caller. The flags that choose a mode are refused then. */
    playwright?: BrowserType
}

export interface Program {
    command: string
    name: string
    version: string
}

/** What launches one of Playwright's browsers: chromium, firefox or webkit as the playwright module exports them. */
export interface BrowserType {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch(options?: object): Promise<unknown>
}

/**
 * Runs the command line with the arguments given and resolves to its exit
 * code. Writes what the command line writes and never exits the process.
 * Meant for one call per process, as the command line is: Node mode
 * installs a resolve hook that stays, and a suite once loaded is not
 * loaded again.
 */
export declare function CLI(options: CLIOptions): Promise<number>
