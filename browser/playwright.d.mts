// Hand-written declarations for playwright.mjs, so src/cli/ can call it
// with types while Playwright's own types stay out of this package.

import type {TAL} from "test-assert-lite"

export interface BrowserRunOptions {
    /** Origin of the server that carries htdocs/ and the mounted suites. */
    origin: string
    /** Suite URLs on that origin, loaded as module scripts in this order. */
    urls: string[]
}

/**
 * Runs the suites in headless Chromium and resolves to what run() resolved
 * to. Rejects when Playwright is missing or the page reported errors.
 */
export function runInBrowser(options: BrowserRunOptions): Promise<TAL.TestSummary>
