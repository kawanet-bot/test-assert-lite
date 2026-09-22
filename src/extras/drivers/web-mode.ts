import {createHostServices} from "../host-services.ts"
import type {ModeOptions, WebModeOptions} from "../mode-options.ts"
import {createApp} from "../server/app.ts"
import {serve} from "../server/serve.ts"
import {runInPlaywright} from "./playwright.ts"
import {runInWebDriver} from "./webdriver.ts"

// How long a browser run, --playwright or --webdriver, may stay silent.
// Before begin, the browser most likely could not reach the server. After
// begin, a quiet page still reports every ten seconds, so this long means
// the browser or its tab is gone. A hung test keeps reporting, so it waits.
const SILENCE_MS = 30_000

export const runWebMode = async (options: ModeOptions & WebModeOptions) => {
    const {mode, session, imports} = options
    const services = createHostServices()

    try {
        // The application is the middleware. Reports go to stdout.
        // Server logs go to stderr.
        const app = createApp({
            scripts: options.scripts,
            imports,
            mount: options.mount,
            session,
            eval: options.eval,
            watch: mode === "serve",
            services,
            timeout: (mode !== "serve" ? SILENCE_MS : undefined),
        })

        // A server that cannot listen, its port taken say, is an error to show;
        // the application, with its watch, must not keep the process up for it.
        const server = await serve({
            handler: app.handler,
            host: options.host,
            port: options.port,
            origin: options.origin,
            quiet: session.quiet,
            services,
        })

        const url = `${server.origin}${app.page}`

        if (mode === "serve") {
            // Only the URL goes to stdout, so it can be piped. The server keeps
            // the process alive until an interrupt, which resolves this.
            const entryURL = options.session.files?.length || options.eval != null ? url : `${server.origin}/`
            process.stdout.write(`${entryURL}\n`)
            process.stderr.write("Serving; press Ctrl-C to stop.\n")
            process.once("SIGINT", () => services.resolve({success: true}))
            return await services.finished
        }

        services.ending.then(result => services.resolve(result))

        if (mode === "webdriver") {
            const {custom, endpoint} = options
            await runInWebDriver({url, services, custom, endpoint})
        } else if (mode === "playwright") {
            const {custom, engine} = options
            await runInPlaywright({url, services, custom, engine})
        } else {
            throw new Error(`Invalid mode: ${mode}`)
        }
    } catch (error: unknown) {
        services.reject(error as Error)
    }
    return await services.finished
}
