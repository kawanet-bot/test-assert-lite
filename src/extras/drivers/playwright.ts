export interface PlaywrightRunOptions {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Settles when the run finishes or fails; the browser closes then. */
    completion: Promise<unknown>
    /** Which browser engine Playwright launches; chromium by default. */
    engine?: BrowserName
}

type BrowserName = "chromium" | "firefox" | "webkit"

interface BrowserTypeLike {
    launch(options?: object): Promise<BrowserLike>
}

interface BrowserLike {
    on(event: "disconnected", listener: () => any): this

    newPage(options?: object): Promise<PageLike>

    close(options?: object): Promise<void>
}

interface PageLike {
    goto(url: string, options?: object): Promise<void>
}

// Loaded on the call, not at import time, so the module itself can be
// imported without Playwright and a missing package fails with a hint.
const launchPlaywright = async (name: BrowserName): Promise<BrowserLike> => {
    try {
        const playwright = await import("playwright" as string) as {[key in BrowserName]: BrowserTypeLike}
        return playwright[name]?.launch()
    } catch (error) {
        if ((error as {code: string})?.code !== "ERR_MODULE_NOT_FOUND") throw error
        throw new Error(`Playwright is not installed: \`npm install -D playwright && npx playwright install ${name}\``)
    }
}

/**
 * Opens `url` in a headless browser and keeps it open until `completion`
 * settles. Rejects when Playwright is missing or the browser is gone.
 */
export const runInPlaywright = async ({url, completion, engine = "chromium"}: PlaywrightRunOptions) => {
    const browser = await launchPlaywright(engine)
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
