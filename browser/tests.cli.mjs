import {chromium} from "playwright"
import {fileURLToPath, pathToFileURL} from "node:url"

const html = fileURLToPath(new URL("./tests.html", import.meta.url))

const run = async () => {
    const browser = await chromium.launch()

    try {
        const page = await browser.newPage()
        const pageErrors = []
        page.on("pageerror", error => pageErrors.push(error))

        await page.goto(pathToFileURL(html).href)

        // Completion is a state, not a promise: the page publishes what
        // run() resolved to, and an unfinished or broken page just never
        // does -- so this times out instead of passing.
        await page.waitForFunction(() => window.testSummary !== undefined, null, {timeout: 60_000})
        const {counts, duration_ms, success} = await page.evaluate(() => window.testSummary)
        const {failed, passed, skipped, tests} = counts
        console.log(`${passed} passing, ${failed} failing, ${skipped} skipped (${tests} tests, ${Math.round(duration_ms)}ms)`)

        if (pageErrors.length) {
            throw new AggregateError(pageErrors, "Browser page errors occurred")
        }
        // success rather than the counter: a failure outside a test body,
        // such as a hook that threw, never reaches failed.
        if (!success) {
            throw new Error(`Reported ${failed} failed test(s)`)
        }
        if (!tests) {
            throw new Error("Ran no tests")
        }
    } finally {
        await browser.close()
    }
}

run().catch(error => {
    console.error(error)
    process.exitCode = 1
})
