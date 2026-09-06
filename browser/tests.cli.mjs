// Browser counterpart of src/cli/test-assert-lite.cli.ts: the library and
// the given test bundles are injected into a blank page, so no HTML file
// is needed. Chromium refuses file:// scripts from about:blank, which is
// why the files go through addScriptTag rather than <script src>.

import {chromium} from "playwright"
import {resolve} from "node:path"
import {fileURLToPath} from "node:url"

const USAGE = "Usage: node tests.cli.mjs <file...>\n"

const lib = fileURLToPath(new URL("../dist/test-assert-lite.min.js", import.meta.url))

const files = process.argv.slice(2)

if (files.includes("-h") || files.includes("--help")) {
    process.stdout.write(USAGE)
    process.exit(0)
}

if (!files.length) {
    process.stderr.write(USAGE)
    process.exit(1)
}

const run = async () => {
    const browser = await chromium.launch()

    try {
        const page = await browser.newPage()
        const pageErrors = []
        page.on("pageerror", error => pageErrors.push(error))
        // The default reporter writes to the page console; relay it so the
        // output matches what the Node CLI shows.
        page.on("console", msg => (msg.type() === "error" ? console.error : console.log)(msg.text()))

        await page.setContent(`<meta charset="utf-8">`)
        await page.addScriptTag({path: lib})
        for (const file of files) {
            await page.addScriptTag({path: resolve(file)})
        }

        // evaluate() resolves to what run() resolved to, so no polling and
        // no timeout here: a hanging test hangs, the same as in node --test.
        // The reporter already printed the totals; the summary only decides
        // the exit status.
        const {counts, success} = await page.evaluate(() => TAL.run())
        const {failed, tests} = counts

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
