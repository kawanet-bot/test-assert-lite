// Playwright adapter for the browser test CLI: the one file that imports
// playwright, which is not a dependency of this package.

import {runInBrowser, type BrowserLike, type WebRunFn} from "./web-run.ts"

export interface RunInPlaywrightOptions {
    /** Which browser engine Playwright launches; chromium by default. */
    engine?: BrowserName
}

type BrowserName = "chromium" | "firefox" | "webkit"

interface BrowserTypeLike {
    launch(options?: object): Promise<BrowserLike>
}

export const runInPlaywright: WebRunFn<RunInPlaywrightOptions> = async ({url, completion, options}) => {
    const engine = options?.engine as BrowserName || "chromium"
    let browserType: BrowserTypeLike | undefined = undefined

    try {
        // Loaded on the call, not at import time, so the module itself can be
        // imported without Playwright and a missing package fails with a hint.
        const playwright = await import("playwright" as string) as {[key in BrowserName]: BrowserTypeLike}
        browserType = playwright[engine]
    } catch (error) {
        if ((error as {code: string})?.code !== "ERR_MODULE_NOT_FOUND") throw error
    }

    if (!browserType) {
        throw new Error(`Playwright is not ready: \`npm install -D playwright && npx playwright install ${engine}\``)
    }

    const browser = await browserType.launch()

    return runInBrowser({url, completion, options: {browser}})
}
