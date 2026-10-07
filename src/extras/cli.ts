// The command line as a function: options.ts reads the arguments, and
// this runs what they ask for, in this Node process or through --serve
// for a person's browser. An executable built on this fixes one browser
// mode. Only explicit file names are accepted, no globs.

import type {BrowserType} from "playwright-core"
import {stringify} from "../utils/stringify.ts"
import {runInNode} from "./drivers/node.ts"
import {runWebMode} from "./drivers/web-mode.ts"
import type {FixedMode, ModeOptions} from "./mode-options.ts"
import {readOptions, usageOf} from "./options.ts"
import {UsageError} from "./usage-error.ts"
import {VERSION} from "./version.ts"

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
    /** What the executable calls itself: the command for the usage, the package and its version for -v. Default: this package's. */
    program?: Program
    /** Fixes the run on a WebDriver server. --serve is refused then. */
    webdriver?: boolean
    /** Fixes the run on this Playwright engine, imported by the caller. --serve is refused then. */
    playwright?: BrowserType
}

export interface Program {
    command: string
    name: string
    version: string
}

const OWN: Program = {command: "tacli", name: "test-assert-cli", version: VERSION}

const runCLI = async (options: ModeOptions, program: Program, fixed: FixedMode): Promise<number> => {
    const {mode} = options
    if (mode === "help") {
        process.stdout.write(usageOf(program.command, fixed))
        return 0
    }

    if (mode === "version") {
        process.stdout.write(`${program.name} ${program.version}\n`)
        return 0
    }

    if (mode === "node") {
        const result = await runInNode({
            imports: options.imports,
            session: options.session,
            eval: options.eval,
            argv: options.argv,
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
export const CLI = async ({args, program = OWN, webdriver, playwright}: CLIOptions): Promise<number> => {
    const fixed: FixedMode = {webdriver, playwright}
    let options: ReturnType<typeof readOptions>

    try {
        options = readOptions(args, fixed)
    } catch (error) {
        if (!(error instanceof UsageError)) throw error
        if (error.message) process.stderr.write(`${stringify(error)}\n`)
        process.stderr.write(usageOf(program.command, fixed))
        return 2 // EXIT_USAGE
    }

    return await runCLI(options, program, fixed)
}
