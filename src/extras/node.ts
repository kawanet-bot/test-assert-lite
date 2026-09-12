// Node mode of the CLI. Mocha's CLI loads every test file first and calls
// run() once at the end, since run() only reports whatever has been
// registered by then; this follows the same two-phase shape.

import {register} from "node:module"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {AliasFile} from "./import-map.ts"
// By name, not from src/: the suites reach the package through the hook
// below, so run() has to be the instance the package's exports point at.
import type {TAL} from "test-assert-lite"
import {run} from "test-assert-lite"
import {packageRoot} from "./package-root.ts"

// Suites are written against node:test and node:assert, and this package
// stands in for both: an import map in the browser, this table here. Each
// builtin maps onto the subpath of the same name, exactly.
const BUILTINS = new Map([
    ["node:test", "test-assert-lite/test"],
    ["node:assert", "test-assert-lite/assert"],
    ["node:assert/strict", "test-assert-lite/assert/strict"],
])

/** What the hook is handed at registration, and the only place its source and this file meet. */
interface HookData {
    /** Where a subpath of this package resolves from, so a suite's own location does not decide it. */
    parentURL: string
    /** From --import-map and --alias, the specifier to the file URL it takes. */
    aliases: Map<string, string>
    /** The builtins this package stands in for, the specifier to the subpath. */
    builtins: Map<string, string>
}

// An --alias comes first, as in the import map, so it can name a builtin
// too. Written as source because a hook reaches the loader as a module of
// its own; what it works on comes in as data, where types still hold.
const HOOK = `let parentURL, aliases, builtins
export const initialize = (data) => { ({parentURL, aliases, builtins} = data) }
export const resolve = (specifier, context, next) => {
    const url = aliases.get(specifier)
    if (url != null) return {url, shortCircuit: true}
    const builtin = builtins.get(specifier)
    return builtin != null
        ? next(builtin, {...context, parentURL})
        : next(specifier, context)
}
`

/**
 * Loads the suites into this process, in the order given, and runs them.
 * The hook resolves the package from here rather than from the suite, so
 * a suite outside any project, or beside another copy, still lands on the
 * instance run() reads.
 */
export const runInNode = async (suites: string[], imports: AliasFile[]): Promise<TAL.TestSummary> => {
    // A Map, so a specifier named like an Object property finds no alias.
    const aliases = new Map(imports.map(({specifier, file}) => [specifier, pathToFileURL(file).href]))
    const data: HookData = {parentURL: packageRoot().href, aliases, builtins: BUILTINS}
    register(`data:text/javascript,${encodeURIComponent(HOOK)}`, {data})

    for (const file of suites) {
        await import(pathToFileURL(resolve(file)).href)
    }

    return run()
}
