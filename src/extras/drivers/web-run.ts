// The shape every browser driver takes: a page to open, and when to close.
// What a driver needs beside that, a WebDriver endpoint or a Playwright
// engine say, is its own `options`.

import type {BrowserCustom} from "../mode-options.ts"

export interface RunInBrowserOptions {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Settles when the run finishes or fails; the browser closes then. */
    completion: Promise<unknown>

    browser: BrowserLike
    /** Extended configuration via --webdriver-config */
    custom?: BrowserCustom
}

export interface BrowserLike {
    on(event: "disconnected", listener: () => any): this

    /** @see https://playwright.dev/docs/api/class-browser#browser-new-page */
    newPage(options?: object): Promise<PageLike>

    close(): Promise<unknown>
}

export interface PageLike {
    /** @see https://playwright.dev/docs/api/class-page#page-goto */
    goto(url: string, options?: object): Promise<unknown>
}

/**
 * Opens `url` in `browser`, a Playwright-like one already launched, and
 * closes it once `completion` settles. Rejects when the browser is gone.
 */
export const runInBrowser = async ({url, completion, browser, custom}: RunInBrowserOptions): Promise<void> => {
    try {
        // A browser that goes away fails the run at once, ahead of the
        // silence bound the page's own word would otherwise run into.
        const gone = new Promise((_, reject) => {
            browser.on("disconnected", () => reject(new Error("The browser closed before the page reported its end")))
        })
        // Handled here as well: close() below fires this too when something
        // else failed first, and that must not add an unhandled rejection.
        void gone.catch(() => undefined)
        const page = await browser.newPage(custom?.newPage)
        await page.goto(url, custom?.goto)
        await Promise.race([completion, gone])
    } finally {
        await browser.close()
    }
}
