// The shape every browser driver takes: a page to open, and when to close.
// What a driver needs beside that, a WebDriver endpoint or a Playwright
// engine say, is its own `options`.

export interface WebRunOptions<T> {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Settles when the run finishes or fails; the browser closes then. */
    completion: Promise<unknown>
    /** What the driver itself takes, beside the page and its completion. */
    options: T
}

/**
 * Opens `url` in a browser and keeps it open until `completion` settles.
 */
export interface WebRunFn<T> {
    (options: WebRunOptions<T>): Promise<void>
}

export interface BrowserLike {
    on(event: "disconnected", listener: () => any): this

    newPage(options?: object): Promise<PageLike>

    close(options?: object): Promise<unknown>
}

export interface PageLike {
    goto(url: string, options?: object): Promise<unknown>
}

export interface RunInBrowserOptions {
    browser: BrowserLike
    newPage?: object
    goto?: object
}

/**
 * Opens `url` in `browser`, a Playwright-like one already launched, and
 * closes it once `completion` settles. Rejects when the browser is gone.
 */
export const runInBrowser: WebRunFn<RunInBrowserOptions> = async ({url, completion, options}) => {
    const {browser} = options
    try {
        // A browser that goes away fails the run at once, ahead of the
        // silence bound the page's own word would otherwise run into.
        const gone = new Promise((_, reject) => {
            browser.on("disconnected", () => reject(new Error("The browser closed before the page reported its end")))
        })
        // Handled here as well: close() below fires this too when something
        // else failed first, and that must not add an unhandled rejection.
        void gone.catch(() => undefined)
        const page = await browser.newPage(options.newPage)
        await page.goto(url, options.goto)
        await Promise.race([completion, gone])
    } finally {
        await browser.close()
    }
}
