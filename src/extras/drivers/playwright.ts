// Playwright adapter for the browser test CLI. The engine comes from the
// executable, which imports playwright. This package does not depend on it.

import type {BrowserType} from "playwright-core"
import type {tacli} from "test-assert-cli"
import type {RunServices} from "../../utils/run-services.ts"
import type {PlaywrightConfig} from "../mode-options.ts"

export interface RunInPlaywrightOptions {
    /** The run's streams, outcome and cleanup, shared by every part. */
    services: RunServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** The engine as the executable imported it, launched as it is. */
    browserType: tacli.BrowserTypeLike
    /** Extended configuration via --playwright-config */
    custom?: PlaywrightConfig
}

/** Launches the engine headless, or attaches to a browser running already, and opens the page in it. */
export const runInPlaywright = async (options: RunInPlaywrightOptions): Promise<void> => {
    const {custom = {}, services, url} = options ?? {}
    const browserType = options?.browserType as BrowserType
    const {connectOverCDP} = custom

    const browser = !connectOverCDP
        ? await browserType.launch(custom.launch)
        : Array.isArray(connectOverCDP)
            ? await browserType.connectOverCDP(...connectOverCDP)
            : await browserType.connectOverCDP(connectOverCDP)

    const onDisconnected = () => {
        services.reject(new Error("The browser closed before the page reported its end"))
    }

    services.onCleanup(async () => {
        browser.off("disconnected", onDisconnected)
        await page?.close()
        if (context && !defaultContext) await context?.close()
        await browser?.close()
    })

    browser.on("disconnected", onDisconnected)

    const defaultContext = (custom.newContext == null && custom.newPage == null) && browser.contexts()[0]
    const context = defaultContext || (custom.newContext != null && await browser.newContext(custom.newContext))
    const page = context ? await context.newPage() : await browser.newPage(custom.newPage)

    await page.goto(url, custom.goto)
}
