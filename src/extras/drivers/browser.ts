import type {HostServices} from "../host-services.ts"
import type {BrowserCustom} from "../mode-options.ts"

export interface RunInBrowserOptions {
    /** Shared host-side streams, lifecycle and cleanup. */
    services: HostServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** A launched Playwright-like browser. */
    browser: BrowserLike
    /** Extended configuration via --playwright-config */
    custom?: BrowserCustom
}

export interface BrowserLike {
    /** Watches for an unexpected browser exit. */
    on(event: "disconnected", listener: () => any): this

    /** Stops watching for the browser exit. */
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
 * Opens `url` in an already launched browser and registers its cleanup.
 * An unexpected browser disconnect fails the host run.
 */
export const runInBrowser = async ({url, services, browser, custom}: RunInBrowserOptions): Promise<void> => {
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
