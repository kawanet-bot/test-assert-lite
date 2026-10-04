// Playwright adapter for the browser test CLI: the one file that imports
// playwright, which is not a dependency of this package.

import type {RunServices} from "../../utils/run-services.ts"
import type {BrowserCustom, BrowserTypeLike} from "../mode-options.ts"
import {tryImport} from "../try-import.ts"
import type {BrowserLike} from "./browser.ts"
import {runInBrowser} from "./browser.ts"

export interface RunInPlaywrightOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Which browser engine Playwright launches, when the caller did not bring one. */
    engine?: BrowserName
    /** The engine as the caller imported it, launched as it is. */
    browserType?: BrowserTypeLike
    /** Extended configuration via --playwright-config */
    custom?: BrowserCustom
}

type BrowserName = "chromium" | "firefox" | "webkit"

type PlayWrightModule = {[key in BrowserName]: BrowserTypeLike}

/**
 * Launches the engine headless and runs the page in it. Rejects when
 * Playwright is missing, with a hint on installing it.
 */
export const runInPlaywright = async ({url, services, engine, browserType, custom}: RunInPlaywrightOptions): Promise<void> => {
    if (browserType == null) {
        const playwrightModule = (
            await tryImport("playwright") ||
            await tryImport(`playwright-${engine}`) ||
            await tryImport("playwright-core")
        ) as PlayWrightModule

        browserType = engine == null ? undefined : playwrightModule?.[engine]
    }

    if (!browserType) {
        throw new Error(`Playwright is not ready: \`npm install -D playwright && npx playwright install ${engine}\``)
    }

    const browser = await browserType.launch(custom?.launch) as BrowserLike

    return runInBrowser({url, services, custom, browser})
}
