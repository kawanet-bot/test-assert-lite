// Node mode of the CLI. Mocha's CLI loads every test file first and ends
// the run once at the end, since that only reports whatever has been
// registered by then; this follows the same two-phase shape.

import {register} from "node:module"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {TAL} from "test-assert-lite"
import {end, load, session} from "test-assert-lite/session"
import type {Imports} from "../imports.ts"
import type {TestSession} from "../mode-options.ts"

/** What the hook is handed at registration, and the only place its source and this file meet. */
interface HookData {
    /** Each specifier to the file URL it resolves to: this package's own subpaths for node:test and node:assert, and what --import-map and --alias add. */
    aliases: Map<string, string>
    /** A command-line script presented as a module at a file URL that need not exist. */
    virtual?: {url: string, source: string}
}

interface RunInNodeOptions {
    imports: Imports
    session: TestSession
    /** A script to run in place of the files, as a virtual module at cwd/[eval]. */
    eval?: string
}

// Written as source because a hook reaches the loader as a module of its
// own; what it works on comes in as data, where types still hold.
const HOOK = `let aliases, virtual
export const initialize = (data) => { ({aliases, virtual} = data) }
export const resolve = (specifier, context, next) => {
    if (specifier === virtual?.url) return {url: specifier, shortCircuit: true}
    const url = aliases.get(specifier)
    return url != null ? {url, shortCircuit: true} : next(specifier, context)
}
export const load = (url, context, next) => {
    return url === virtual?.url ? {format: "module", source: virtual.source, shortCircuit: true} : next(url, context)
}
`

/**
 * Loads the suites into this process, in the order given, and runs them.
 * The files the hook resolves to are decided here, this package's own
 * from this copy of it, so a suite outside any project, or beside another
 * copy, still lands on the instance end() reads.
 */
export const runInNode = async (options: RunInNodeOptions): Promise<TAL.SessionResult> => {
    const {reporter, quiet, files} = options.session

    // A Map, so a specifier named like an Object property finds no alias.
    // Every item left for Node is a file: the reading of the options saw to it.
    const aliases = new Map([...options.imports.entries()].map(([specifier, item]) => [specifier, pathToFileURL(item.getPath() as string).href]))
    // The hook supplies the source before Node reads this otherwise absent
    // file. Its location gives relative and package imports cwd as their base.
    const cwd = pathToFileURL(resolve(".")).href.replace(/\/?$/, "/")
    const virtual = options.eval == null ? undefined : {url: new URL("[eval]", cwd).href, source: options.eval}
    const evalURL = virtual?.url
    const data: HookData = {aliases, virtual}
    register(`data:text/javascript,${encodeURIComponent(HOOK)}`, {data})

    session({reporter, quiet})

    const urlList = evalURL == null
        ? files.map(file => pathToFileURL(resolve(file)).href)
        : [evalURL]

    for (const file of urlList) {
        await load(file)
    }

    return end()
}
