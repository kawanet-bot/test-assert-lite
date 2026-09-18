// Hand-written declarations for playwright.js, so cli.ts can call it
// with types while Playwright's own types stay out of this package.

export interface PlaywrightRunOptions {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Settles when the run finishes or fails; the browser closes then. */
    completion: Promise<unknown>
    /** Which browser engine Playwright launches; chromium by default. */
    engine?: "chromium" | "firefox" | "webkit"
}

/**
 * Opens `url` in a headless browser and keeps it open until `completion`
 * settles. Rejects when Playwright is missing or the browser is gone.
 */
export function runInPlaywright(options: PlaywrightRunOptions): Promise<void>
