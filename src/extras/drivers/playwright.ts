// Playwright adapter for the browser test CLI. The engine comes from the
// executable, which imports playwright. This package does not depend on it.

import type {RunServices} from "../../utils/run-services.ts"
import type {BrowserCustom, BrowserTypeLike} from "../mode-options.ts"
import type {BrowserLike} from "./browser.ts"
import {runInBrowser} from "./browser.ts"

export interface RunInPlaywrightOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** The engine as the executable imported it, launched as it is. */
    browserType: BrowserTypeLike
    /** Extended configuration via --playwright-config */
    custom?: BrowserCustom
}

/** Launches the engine headless and runs the page in it. */
export const runInPlaywright = async ({url, services, browserType, custom}: RunInPlaywrightOptions): Promise<void> => {
    const browser = await browserType.launch(custom?.launch) as BrowserLike

    return runInBrowser({url, services, custom, browser})
}
