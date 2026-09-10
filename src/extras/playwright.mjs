// Playwright adapter for the browser test CLI: the one file that imports
// playwright, which is not a dependency of this package. The TypeScript
// beside it reaches runInPlaywright() through the hand-written .d.mts, so
// this file is plain JavaScript on purpose.

// Loaded on the call, not at import time, so the module itself can be
// imported without Playwright and a missing package fails with a hint.
const loadPlaywright = async (name) => {
    try {
        return await import("playwright")
    } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error
        throw new Error(`Playwright is not installed: \`npm install -D playwright && npx playwright install ${name}\``)
    }
}

/**
 * Runs the suites on `origin`'s run.html in a headless `browser` (chromium
 * unless told otherwise) and resolves to the verdict the page sends back.
 * Playwright only opens the page: from there the page reports on its own.
 */
export const runInPlaywright = async ({origin, done, browser: name = "chromium"}) => {
    const playwright = await loadPlaywright(name)
    const browser = await playwright[name].launch()
    try {
        // A browser that goes away fails the run at once, ahead of the
        // silence bound the page's own word would otherwise run into.
        const gone = new Promise((_, reject) => browser.on("disconnected", () => reject(new Error("The browser closed before the page reported its end"))))
        const page = await browser.newPage()
        await page.goto(`${origin}/run.html`)
        return await Promise.race([done, gone])
    } finally {
        await browser.close()
    }
}
