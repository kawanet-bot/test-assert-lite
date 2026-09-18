// Hand-written declarations for playwright.js, so cli.ts can call it
// with types while Playwright's own types stay out of this package.

export interface PlaywrightRunOptions {
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** Settles once the page has ended, whatever the outcome; the browser closes on it. */
    settled: Promise<unknown>
    /** Which of Playwright's browsers to launch; chromium by default. */
    browserName?: "chromium" | "firefox" | "webkit"
}

/**
 * Opens `url` in a headless browser and keeps it open until `settled`
 * settles. Rejects when Playwright is missing or the browser is gone.
 */
export function runInPlaywright(options: PlaywrightRunOptions): Promise<void>
