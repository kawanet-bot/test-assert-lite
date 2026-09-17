// Node mode of the CLI. Mocha's CLI loads every test file first and ends
// the run once at the end, since that only reports whatever has been
// registered by then; this follows the same two-phase shape.

import {register} from "node:module"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {TAL} from "test-assert-lite"
import {sharedTAL} from "test-assert-lite"
import type {Imports} from "../imports.ts"
import type {DriverOptions} from "./driver-config.ts"

/** What the hook is handed at registration, and the only place its source and this file meet. */
interface HookData {
    /** Each specifier to the file URL it resolves to: this package's own subpaths for node:test and node:assert, and what --import-map and --alias add. */
    aliases: Map<string, string>
}

// Written as source because a hook reaches the loader as a module of its
// own; what it works on comes in as data, where types still hold.
const HOOK = `let aliases
export const initialize = (data) => { ({aliases} = data) }
export const resolve = (specifier, context, next) => {
    const url = aliases.get(specifier)
    return url != null ? {url, shortCircuit: true} : next(specifier, context)
}
`

/**
 * Loads the suites into this process, in the order given, and runs them.
 * The files the hook resolves to are decided here, this package's own
 * from this copy of it, so a suite outside any project, or beside another
 * copy, still lands on the instance end() reads.
 */
export const runInNode = async (imports: Imports, options: DriverOptions): Promise<TAL.SessionResult> => {
    const {end, it, session} = sharedTAL
    const {reporter, summary} = options

    // A Map, so a specifier named like an Object property finds no alias.
    // Every item left for Node is a file: the reading of the options saw to it.
    const aliases = new Map([...imports.entries()].map(([specifier, item]) => [specifier, pathToFileURL(item.getPath() as string).href]))
    const data: HookData = {aliases}
    register(`data:text/javascript,${encodeURIComponent(HOOK)}`, {data})

    session({reporter, summary})

    const files = (options?.files ?? []).map(file => pathToFileURL(resolve(file)).href)

    const run = async (file: string) => {
        try {
            await import(file)
        } catch (error) {
            it(file.replace(/^[^?]*\//, ""), () => {
                throw error
            })
        }
    }

    for (const file of files) {
        await run(file)
    }

    return end()
}
