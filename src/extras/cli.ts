// The command line as a function: options.ts reads the arguments, and
// this runs what they ask for, in this Node process or through --serve
// for a person's browser. An executable built on this fixes one browser
// mode. Only explicit file names are accepted, no globs.

import type * as declared from "test-assert-cli"
import {stringify} from "../utils/stringify.ts"
import {runInNode} from "./drivers/node.ts"
import {runWebMode} from "./drivers/web-mode.ts"
import type {FixedMode, ModeOptions} from "./mode-options.ts"
import {readOptions, usageOf} from "./options.ts"
import {UsageError} from "./usage-error.ts"
import {VERSION} from "./version.ts"

type Program = declared.tacli.Program

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
            connect: options.connect,
            session: options.session,
            files: options.files,
            eval: options.eval,
        })
        return result?.success ? 0 : 1
    } else {
        const result = await runWebMode(options)
        return result?.success ? 0 : 1
    }
}

/**
 * Runs the command line and resolves to its exit code, or rejects with
 * what it could not handle. The process is the executable's to end. One
 * call per process, as the command line is.
 */
export const CLI: typeof declared.CLI = async ({args, program = OWN, webdriver, playwright}): Promise<number> => {
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
