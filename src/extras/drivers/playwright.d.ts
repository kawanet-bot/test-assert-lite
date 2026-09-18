// Hand-written declarations for playwright.js, so cli.ts can call it
// with types while Playwright's own types stay out of this package.

export interface PlaywrightRunOptions {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Remains pending while the run is active; the browser closes when it settles. */
    running: Promise<unknown>
    /** Which browser engine Playwright launches; chromium by default. */
    engine?: "chromium" | "firefox" | "webkit"
}

/**
 * Opens `url` in a headless browser and keeps it open until `running`
 * settles. Rejects when Playwright is missing or the browser is gone.
 */
export function runInPlaywright(options: PlaywrightRunOptions): Promise<void>
