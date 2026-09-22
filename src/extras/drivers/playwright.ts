// Playwright adapter for the browser test CLI: the one file that imports
// playwright, which is not a dependency of this package.

import type {HostServices} from "../host-services.ts"
import type {BrowserCustom} from "../mode-options.ts"
import {tryImport} from "../try-import.ts"
import type {BrowserLike} from "./browser.ts"
import {runInBrowser} from "./browser.ts"

export interface RunInPlaywrightOptions {
    /** Shared host-side streams, lifecycle and cleanup. */
    services: HostServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Which browser engine Playwright launches. */
    engine: BrowserName
    /** Extended configuration via --playwright-config */
    custom?: BrowserCustom
}

type BrowserName = "chromium" | "firefox" | "webkit"

interface BrowserTypeLike {
    /** @see https://playwright.dev/docs/api/class-browsertype#browser-type-launch */
    launch(options?: object): Promise<BrowserLike>
}

type PlayWrightModule = {[key in BrowserName]: BrowserTypeLike}

/**
 * Launches the engine headless and runs the page in it. Rejects when
 * Playwright is missing, with a hint on installing it.
 */
export const runInPlaywright = async ({url, services, engine, custom}: RunInPlaywrightOptions): Promise<void> => {
    const playwrightModule = (
        await tryImport("playwright") ||
        await tryImport(`playwright-${engine}`) ||
        await tryImport("playwright-core")
    ) as PlayWrightModule

    const browserType = playwrightModule?.[engine]

    if (!browserType) {
        throw new Error(`Playwright is not ready: \`npm install -D playwright && npx playwright install ${engine}\``)
    }

    const browser = await browserType.launch(custom?.launch)

    return runInBrowser({url, services, custom, browser})
}
