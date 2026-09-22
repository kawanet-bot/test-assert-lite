import type {HostServices} from "../host-services.ts"
import type {BrowserCustom} from "../mode-options.ts"

export interface RunInBrowserOptions {
    /** TBD */
    services: HostServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** TBD */
    browser: BrowserLike
    /** Extended configuration via --playwright-config */
    custom?: BrowserCustom
}

export interface BrowserLike {
    on(event: "disconnected", listener: () => any): this

    off(event: "disconnected", listener: () => any): this

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
export const runInBrowser = async ({url, services, browser, custom}: RunInBrowserOptions): Promise<void> => {
    const onDisconnected = () => {
        services.reject(new Error("The browser closed before the page reported its end"))
    }

    services.cleanups.add(async () => {
        browser.off("disconnected", onDisconnected)
        await browser.close()
    })

    browser.on("disconnected", onDisconnected)
    const page = await browser.newPage(custom?.newPage)
    await page.goto(url, custom?.goto)
}
