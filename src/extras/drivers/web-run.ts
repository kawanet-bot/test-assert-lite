export interface WebRunOptions<T> {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Settles when the run finishes or fails; the browser closes then. */
    completion: Promise<unknown>
    /** custom options per driver */
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

export const runInBrowser: WebRunFn<{browser: BrowserLike}> = async ({url, completion, options}) => {
    const {browser} = options

    /**
     * Opens `url` in a headless browser and keeps it open until `completion`
     * settles. Rejects when Playwright is missing or the browser is gone.
     */
    try {
        // A browser that goes away fails the run at once, ahead of the
        // silence bound the page's own word would otherwise run into.
        const gone = new Promise((_, reject) => {
            browser.on("disconnected", () => reject(new Error("The browser closed before the page reported its end")))
        })
        // Handled here as well: close() below fires this too when something
        // else failed first, and that must not add an unhandled rejection.
        void gone.catch(() => undefined)
        const page = await browser.newPage()
        await page.goto(url)
        await Promise.race([completion, gone])
    } finally {
        await browser.close()
    }
}
