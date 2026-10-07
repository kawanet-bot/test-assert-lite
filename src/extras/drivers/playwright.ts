// Playwright adapter for the browser test CLI. The engine comes from the
// executable, which imports playwright. This package does not depend on it.

import type {BrowserType, Page} from "playwright-core"
import type {RunServices} from "../../utils/run-services.ts"
import type {PlaywrightConfig} from "../mode-options.ts"

export interface RunInPlaywrightOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** The engine as the executable imported it, launched as it is. */
    browserType: BrowserType
    /** Extended configuration via --playwright-config */
    custom?: PlaywrightConfig
}

type Endpoint = NonNullable<PlaywrightConfig["connectOverCDP"]>

/** Launches the engine headless, or attaches to a browser running already, and opens the page in it. */
export const runInPlaywright = async (options: RunInPlaywrightOptions): Promise<void> => {
    const endpoint = options.custom?.connectOverCDP
    return endpoint ? attachToBrowser(endpoint, options) : launchBrowser(options)
}

// The browser is this run's, so closing it on cleanup ends its pages too.
const launchBrowser = async ({url, services, browserType, custom = {}}: RunInPlaywrightOptions): Promise<void> => {
    const browser = await browserType.launch(custom.launch)
    const onDisconnected = () => {
        services.reject(new Error("The browser closed before the page reported its end"))
    }
    services.onCleanup(async () => {
        browser.off("disconnected", onDisconnected)
        await browser.close()
    })
    browser.on("disconnected", onDisconnected)
    const page = await browser.newPage(custom.newPage)
    await page.goto(url, custom.goto)
}

// The browser is a person's, with a context open already. The page goes
// there unless newPage asks for a context of its own, and is closed by
// hand, as close() leaves that browser and its own pages be.
const attachToBrowser = async (endpoint: Endpoint, {url, services, browserType, custom = {}}: RunInPlaywrightOptions): Promise<void> => {
    const browser = Array.isArray(endpoint)
        ? await browserType.connectOverCDP(...endpoint)
        : await browserType.connectOverCDP(endpoint)
    const onDisconnected = () => {
        services.reject(new Error("The browser closed before the page reported its end"))
    }
    const shared = custom.newPage == null ? browser.contexts()[0] : undefined
    let page: Page | undefined
    services.onCleanup(async () => {
        browser.off("disconnected", onDisconnected)
        if (shared != null) await page?.close()
        await browser.close()
    })
    browser.on("disconnected", onDisconnected)
    page = shared != null ? await shared.newPage() : await browser.newPage(custom.newPage)
    await page.goto(url, custom.goto)
}

