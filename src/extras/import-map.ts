// What the suites' specifiers resolve to, as the command line names it:
// an --alias, or an import map file read as a page would up to what the
// CLI can do. A reason names the option it came from and ends in the key
// to go and look at, so the caller has nothing to add.

import {readFileSync} from "node:fs"
import {resolve} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {UsageError} from "./usage-error.ts"

export interface AliasFile {
    specifier: string
    /** The ES module the specifier resolves to, absolute. */
    file: string
}

export interface AliasUrl {
    specifier: string
    /** The address the page takes as it is: one starting with "/", or an absolute URL. */
    url: string
}

/** What a specifier resolves to: a file served by the CLI, or a URL the page takes as it is. */
export type Import = AliasFile | AliasUrl

/** Which half of the union an entry is: the file the CLI serves, against the address the page takes as it is. */
export const isAliasFile = (entry: Import): entry is AliasFile => "file" in entry

// An import map file, read as a page would up to what the CLI can do:
// "imports" alone, keys as written, addresses resolved against the file.
// A relative address is a file the CLI serves; "/" and absolute URLs are
// the page's. A relative key, which a page would resolve against its own
// base, and a prefix entry, "/" at the end, are refused, not mismatched.
export const importMapOf = (file: string): Import[] => {
    const path = resolve(file)
    let map: unknown
    try {
        map = JSON.parse(readFileSync(path, "utf8"))
    } catch (error) {
        throw new UsageError(`--import-map: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (typeof map !== "object" || map == null || Array.isArray(map)) throw new UsageError("--import-map: not an object")
    for (const key of Object.keys(map)) if (key !== "imports") throw new UsageError(`--import-map: only "imports" is supported: "${key}"`)
    const {imports = {}} = map as {imports?: unknown}
    if (typeof imports !== "object" || imports == null || Array.isArray(imports)) throw new UsageError('--import-map: not an object: "imports"')

    const base = pathToFileURL(path)
    return Object.entries(imports).map(([specifier, address]) => {
        if (typeof address !== "string") throw new UsageError(`--import-map: not a string: "${specifier}"`)
        if (/^(\.\.?\/|\/)/.test(specifier) || specifier.endsWith("/") || address.endsWith("/")) throw new UsageError(`--import-map: no prefix entry or relative key: "${specifier}"`)
        if (/^\.\.?\//.test(address)) return {specifier, file: fileURLToPath(new URL(address, base))}
        if (address.startsWith("/") || URL.canParse(address)) return {specifier, url: address}
        throw new UsageError(`--import-map: an address starts with ./, ../, / or a scheme: "${specifier}"`)
    })
}

// Each --alias is `<specifier>=<file>`, split at the first "=".
export const aliasOf = (entry: string): AliasFile => {
    const at = entry.indexOf("=")
    if (at < 1 || at === entry.length - 1) throw new UsageError(`--alias takes <specifier>=<file>: ${entry}`)
    return {specifier: entry.slice(0, at), file: resolve(entry.slice(at + 1))}
}

// The import map's entries first and each --alias after, so the command
// line has the last word.
export const importsOf = (mapFile: string | undefined, aliases: string[]): Import[] => {
    const mapped = mapFile == null ? [] : importMapOf(mapFile)
    return [...mapped, ...aliases.map(aliasOf)]
}
