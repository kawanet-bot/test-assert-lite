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
 * Runs the suites at `urls` on `origin`'s console.html in a headless
 * `browser` (chromium unless told otherwise), after the classic `scripts`
 * (a library's IIFE build, say) have run, and resolves to what run()
 * resolved to. Page errors are collected and thrown once run() has settled.
 */
export const runInPlaywright = async ({origin, scripts = [], urls, browser: name = "chromium"}) => {
    const playwright = await loadPlaywright(name)
    const browser = await playwright[name].launch()
    try {
        const page = await browser.newPage()
        const pageErrors = []
        page.on("pageerror", error => pageErrors.push(error))
        // The default reporter writes to the page console; relay it so the
        // output matches what the Node CLI shows.
        page.on("console", msg => (msg.type() === "error" ? console.error : console.log)(msg.text()))

        await page.goto(`${origin}/console.html`)
        // Classic scripts first, so the globals they leave are in place when
        // the suites load. A url tag resolves once the script has run, and
        // for a module once the whole graph has executed, so run() below
        // cannot overtake the registration; inline content would.
        for (const url of scripts) {
            await page.addScriptTag({url})
        }
        for (const url of urls) {
            await page.addScriptTag({type: "module", url})
        }

        // The suites register into the module instance behind the import
        // map, so run() must come from that same instance. evaluate()
        // resolves to what run() resolved to: no polling and no timeout, a
        // hanging test hangs, the same as in node --test. The name is passed
        // in so a bundler never takes this page-side import for its own.
        const summary = await page.evaluate(name => import(name).then(m => m.run()), "test-assert-lite")

        if (pageErrors.length) {
            throw new AggregateError(pageErrors, "Browser page errors occurred")
        }
        return summary
    } finally {
        await browser.close()
    }
}
