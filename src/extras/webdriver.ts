// WebDriver adapter for the browser test CLI: the HTTP protocol that
// safaridriver, chromedriver and geckodriver speak, so a browser Playwright
// cannot launch, Safari on a Mac say, runs the suites too. Node's fetch()
// is all it takes, so no optional dependency is kept out of tsc here.

import type {TAL} from "test-assert-lite"

export interface WebDriverRunOptions {
    /** Origin of the server that carries htdocs/ and the mounted suites. */
    origin: string
    /** The WebDriver server, such as http://127.0.0.1:4444 */
    endpoint: string
    /** JSON sent as the body of POST /session; no capabilities by default. */
    session?: string
}

// A WebDriver response carries its payload, or its error, under `value`.
interface Reply {
    value: {sessionId?: string, error?: string, message?: string} & Record<string, unknown>
}

// Runs in the page, called until it reports the end: what the reporter
// wrote from index `from` on, and once run() is over, the errors and the
// summary. Each call returns within 10 seconds, under the driver's script
// timeout of 30, so a long suite is polled rather than waited for in one call.
const POLL = `
const [from, done] = arguments
const started = Date.now()
const tick = () => {
    const lines = window.testLines.slice(from)
    const errors = window.testErrors
    if (errors != null || lines.length || Date.now() - started > 10000) done({lines, errors, summary: window.testSummary})
    else setTimeout(tick, 100)
}
tick()
`

interface Polled {
    lines: string[]
    errors?: string[] | null
    summary?: TAL.TestSummary | null
}

const call = async (endpoint: string, method: string, path: string, body?: string): Promise<Reply["value"]> => {
    const res = await fetch(endpoint + path, {method, headers: {"content-type": "application/json"}, body})
    const {value} = await res.json() as Reply
    if (!res.ok) throw new Error(`${method} ${path}: ${value.error}: ${value.message}`)
    return value
}

/**
 * Runs the suites on `origin`'s webdriver.html in the browser the WebDriver
 * server at `endpoint` drives, and resolves to what run() resolved to. Page
 * errors are collected and thrown once run() has settled.
 */
export const runInWebDriver = async ({origin, endpoint, session}: WebDriverRunOptions): Promise<TAL.TestSummary> => {
    let created: Reply["value"]
    try {
        created = await call(endpoint, "POST", "/session", session ?? JSON.stringify({capabilities: {}}))
    } catch (error) {
        // Nothing listening is the likely case, and the most useful hint.
        if (!(error instanceof TypeError)) throw error
        throw new Error(`No WebDriver server at ${endpoint}: \`safaridriver -p 4444\` or \`chromedriver --port=4444\``, {cause: error})
    }
    const base = `/session/${created.sessionId}`
    try {
        await call(endpoint, "POST", `${base}/url`, JSON.stringify({url: `${origin}/webdriver.html`}))

        // Relayed as it comes, so the output reads as the Node CLI's does.
        let from = 0
        for (;;) {
            const {lines, errors, summary} = await call(endpoint, "POST", `${base}/execute/async`, JSON.stringify({script: POLL, args: [from]})) as unknown as Polled
            for (const line of lines) process.stdout.write(line)
            from += lines.length
            if (errors == null) continue
            if (errors.length) throw new AggregateError(errors.map(error => new Error(error)), "Browser page errors occurred")
            return summary as TAL.TestSummary
        }
    } finally {
        await call(endpoint, "DELETE", base)
    }
}
