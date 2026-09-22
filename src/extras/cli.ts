// The command line as a function: options.ts reads the arguments, and
// this runs what they ask for. By default the suites run in this Node
// process; --playwright runs them in one of Playwright's headless
// browsers, --webdriver in whatever browser a WebDriver server drives,
// and --serve hands the same page to a person. Directory search and glob
// expansion are left to the shell: only explicit file names are accepted.

import {stringify} from "../utils/stringify.ts"
import {VERSION} from "../utils/version.ts"
import {runInNode} from "./drivers/node.ts"
import {runWebMode} from "./drivers/web-mode.ts"
import type {ModeOptions} from "./mode-options.ts"
import {readOptions, USAGE} from "./options.ts"
import {UsageError} from "./usage-error.ts"

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
}

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
    } else {
        const result = await runWebMode(options)
        return result?.success ? 0 : 1
    }
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
