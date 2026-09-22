// WebDriver adapter for the browser test CLI: the HTTP protocol that
// safaridriver, chromedriver and geckodriver speak, so a browser Playwright
// cannot launch, Safari on a Mac say, runs the suites too. Node's fetch()
// is all it takes, so no optional dependency is kept out of tsc here.

import type {RunServices} from "../../utils/run-services.ts"
import type {WebDriverCustom} from "../mode-options.ts"

export interface RunInWebDriverOptions {
    /** Shared host-side streams, lifecycle and cleanup. */
    services: RunServices
    /** URL of the page to open, under the run's own path on the CLI's server. */
    url: string
    /** The WebDriver server, such as http://127.0.0.1:4444 */
    endpoint?: string
    /** Extended configuration via --webdriver-config */
    custom?: WebDriverCustom
}

// A WebDriver response carries its payload, or its error, under `value`.
interface Reply {
    value: {sessionId?: string, error?: string, message?: string} & Record<string, unknown>
}

const call = async (endpoint: string, method: string, path: string, body?: string): Promise<Reply["value"]> => {
    const res = await fetch(endpoint + path, {method, headers: {"content-type": "application/json"}, body})
    const {value} = await res.json() as Reply
    if (!res.ok) throw new Error(`${method} ${path}: ${value.error}: ${value.message}`)
    return value
}

/**
 * Opens `url` in a new WebDriver session and registers its cleanup. The
 * page reports on its own, so no driver command waits for the run.
 */
export const runInWebDriver = async ({url, services, endpoint, custom}: RunInWebDriverOptions): Promise<void> => {
    if (!endpoint) endpoint = "http://127.0.0.1:4444"
    let created: Reply["value"]

    const sessionReq = {capabilities: (custom?.capabilities || {})}

    try {
        created = await call(endpoint, "POST", "/session", JSON.stringify(sessionReq, null, 2))
    } catch (error) {
        // Nothing listening is the likely case, and the most useful hint.
        if (!(error instanceof TypeError)) throw error
        throw new Error(`No WebDriver server at ${endpoint}: \`safaridriver -p 4444\` or \`chromedriver --port=4444\``, {cause: error})
    }

    const base = `/session/${created.sessionId}`

    services.onCleanup(async () => {
        await call(endpoint, "DELETE", base)
    })

    await call(endpoint, "POST", `${base}/url`, JSON.stringify({url}))
}
