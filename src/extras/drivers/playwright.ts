// Playwright adapter for the browser test CLI: the one file that imports
// playwright, which is not a dependency of this package.

import type {BrowserLike, WebRunFn} from "./web-run.ts"
import {runInBrowser} from "./web-run.ts"

export interface RunInPlaywrightOptions {
    /** Which browser engine Playwright launches. */
    engine: BrowserName
}

type BrowserName = "chromium" | "firefox" | "webkit"

interface BrowserTypeLike {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch(options?: object): Promise<BrowserLike>
}

const loadBrowserType = async (pkg: string, engine: BrowserName = "chromium"): Promise<BrowserTypeLike | undefined> => {
    try {
        // Loaded on the call, not at import time, so the module itself can be
        // imported without Playwright and a missing package fails with a hint.
        const playwright = await import(pkg) as {[key in BrowserName]: BrowserTypeLike}
        return playwright[engine]
    } catch (error) {
        if ((error as {code: string})?.code !== "ERR_MODULE_NOT_FOUND") throw error
    }
}

/**
 * Launches the engine headless and runs the page in it. Rejects when
 * Playwright is missing, with a hint on installing it.
 */
export const runInPlaywright: WebRunFn<RunInPlaywrightOptions> = async ({url, completion, options, custom}) => {
    const {engine} = options

    const browserType = await loadBrowserType("playwright", engine) ||
        await loadBrowserType(`playwright-${engine}`, engine) ||
        await loadBrowserType("playwright-core", engine)

    if (!browserType) {
        throw new Error(`Playwright is not ready: \`npm install -D playwright && npx playwright install ${engine}\``)
    }

    const browser = await browserType.launch(custom?.launch)

    return runInBrowser({url, completion, custom, options: {browser}})
}
