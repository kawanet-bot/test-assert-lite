// Hand-written declarations for playwright.mjs, so cli.ts can call it
// with types while Playwright's own types stay out of this package.

import type {TAL} from "test-assert-lite"

export interface BrowserRunOptions {
    /** Origin of the server that carries htdocs/ and the mounted suites. */
    origin: string
    /** Classic script URLs to run before the suites, in this order. */
    scripts?: string[]
    /** Suite URLs on that origin, loaded as module scripts in this order. */
    urls: string[]
    /** Which of Playwright's browsers to launch; chromium by default. */
    browser?: "chromium" | "firefox" | "webkit"
}

/**
 * Runs the suites in a headless browser and resolves to what run() resolved
 * to. Rejects when Playwright is missing or the page reported errors.
 */
export function runInPlaywright(options: BrowserRunOptions): Promise<TAL.TestSummary>
