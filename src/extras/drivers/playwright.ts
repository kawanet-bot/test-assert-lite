// Playwright adapter for the browser test CLI. The engine comes from the
// executable, which imports playwright. This package does not depend on it.

import type {BrowserType} from "playwright-core"
import type {RunServices} from "../../utils/run-services.ts"
import type {BrowserCustom} from "../mode-options.ts"

export interface RunInPlaywrightOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** The engine as the executable imported it, launched as it is. */
    browserType: BrowserType
    /** Extended configuration via --playwright-config */
    custom?: BrowserCustom
}

/**
 * Launches the engine headless, opens the page in it and registers the
 * browser's cleanup. An unexpected browser disconnect fails the host run.
 */
export const runInPlaywright = async ({url, services, browserType, custom}: RunInPlaywrightOptions): Promise<void> => {
    const browser = await browserType.launch(custom?.launch)
    const onDisconnected = () => {
        services.reject(new Error("The browser closed before the page reported its end"))
    }

    services.onCleanup(async () => {
        browser.off("disconnected", onDisconnected)
        await browser.close()
    })

    browser.on("disconnected", onDisconnected)
    const page = await browser.newPage(custom?.newPage)
    await page.goto(url, custom?.goto)
}
