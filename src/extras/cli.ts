// The command line as a function: options.ts reads the arguments, and
// this runs what they ask for. By default the suites run in this Node
// process; --playwright runs them in one of Playwright's headless
// browsers, --webdriver in whatever browser a WebDriver server drives,
// and --serve hands the same page to a person. Directory search and glob
// expansion are left to the shell: only explicit file names are accepted.

import {stringify} from "../utils/stringify.ts"
import {VERSION} from "../utils/version.ts"
import {runInNode} from "./drivers/node.ts"
import {runInPlaywright} from "./drivers/playwright.ts"
import {runInWebDriver} from "./drivers/webdriver.ts"
import {createHostServices} from "./host-services.ts"
import type {ModeOptions} from "./mode-options.ts"
import {readOptions, USAGE} from "./options.ts"
import {createApp} from "./server/app.ts"
import {serve} from "./server/serve.ts"
import {UsageError} from "./usage-error.ts"

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
}

const SILENCE_MS = 30_000

const runCLI = async (options: ModeOptions): Promise<number> => {
    const {mode} = options
    if (mode === "help") {
        process.stdout.write(USAGE)
        return 0
    }

    if (mode === "version") {
        process.stdout.write(`test-assert-lite ${VERSION}\n`)
        return 0
    }

    const {session, imports} = options
    if (mode === "node") {
        const result = await runInNode({
            imports,
            session,
            eval: options.eval,
        })
        return result?.success ? 0 : 1
    }

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
            process.once("SIGINT", () => services.resolve(0))
            return await services.finished
        }

        services.ending.then(result => services.resolve(result?.success ? 0 : 1))

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

/**
 * Runs the command line with `args` and resolves to its exit code. Writes
 * what the command line writes, and rejects with what it could not handle,
 * but never exits the process: that is the executable's part. Meant for
 * one call per process, as the command line is: Node mode installs a
 * resolve hook that stays, and a suite once loaded is not loaded again.
 */
export const CLI = async ({args}: CLIOptions): Promise<number> => {
    let options: ReturnType<typeof readOptions>

    try {
        options = readOptions(args)
    } catch (error) {
        if (!(error instanceof UsageError)) throw error
        if (error.message) process.stderr.write(`${stringify(error)}\n`)
        process.stderr.write(USAGE)
        return 2 // EXIT_USAGE
    }

    return await runCLI(options)
}
