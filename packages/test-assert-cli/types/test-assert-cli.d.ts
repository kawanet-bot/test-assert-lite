/**
 * https://github.com/kawanet/test-assert-lite
 *
 * Serve your `node:test` files to the browser, or run them in Node.js.
 */

export {} // external module indicator

export declare namespace tacli {

    interface CLIOptions {
        /** The arguments as the executable gets them: process.argv.slice(2). */
        args: string[]
        /** The executable's own names: the command for the usage, the package and its version for -v. Default: this package's. */
        program?: Program
        /** Locks the run to a WebDriver server. --serve is refused then. */
        webdriver?: boolean
        /** Locks the run to this Playwright browser type, which the caller imports. --serve is refused then. */
        playwright?: BrowserTypeLike
    }

    interface Program {
        command: string
        name: string
        version: string
    }

    /** A Playwright browser type, such as chromium from the playwright module. */
    interface BrowserTypeLike {
        /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
        launch(options?: object): Promise<unknown>

        /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp */
        connectOverCDP(endpointURL: string, options?: object): Promise<unknown>
    }
}

/** Runs the command line once per process and resolves to its exit code. The caller ends the process. */
export declare function CLI(options: tacli.CLIOptions): Promise<number>
