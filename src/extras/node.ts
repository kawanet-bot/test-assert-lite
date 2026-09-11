// Node mode of the CLI. Mocha's CLI loads every test file first and calls
// run() once at the end, since run() only reports whatever has been
// registered by then; this follows the same two-phase shape.

import {register} from "node:module"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import type {Alias} from "./options.ts"
// By name, not from src/: the suites reach the package through the hook
// below, so run() has to be the instance the package's exports point at.
import type {TAL} from "test-assert-lite"
import {run} from "test-assert-lite"
import {packageRoot} from "./package-root.ts"

// Suites are written against node:test and node:assert, and this package
// stands in for both: an import map in the browser, a resolve hook here.
// An --alias comes first, as in the import map, so it can name a builtin
// too; each builtin then maps onto the subpath of the same name, exactly.
const HOOK = `let parentURL, aliases
const mapped = new Set(["node:test", "node:assert", "node:assert/strict"])
export const initialize = (data) => { parentURL = data.parentURL; aliases = data.aliases }
export const resolve = (specifier, context, next) =>
    specifier in aliases ? {url: aliases[specifier], shortCircuit: true}
    : mapped.has(specifier)
        ? next("test-assert-lite/" + specifier.slice("node:".length), {...context, parentURL})
        : next(specifier, context)
`

/**
 * Loads the suites into this process, in the order given, and runs them.
 * The hook resolves the package from here rather than from the suite, so
 * a suite outside any project, or beside another copy, still lands on the
 * instance run() reads.
 */
export const runInNode = async (suites: string[], aliases: Alias[]): Promise<TAL.TestSummary> => {
    const table = Object.fromEntries(aliases.map(({specifier, file}) => [specifier, pathToFileURL(file).href]))
    register(`data:text/javascript,${encodeURIComponent(HOOK)}`, {data: {parentURL: packageRoot().href, aliases: table}})

    for (const file of suites) {
        await import(pathToFileURL(resolve(file)).href)
    }

    return run()
}
