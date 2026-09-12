// What the suites' specifiers resolve to, as the command line names it: an
// --alias, or an entry of an import map file. Each item knows what kind
// of target it holds, what a mode cannot take of it, the local file it is,
// and the address a page gets; the list keeps them in order, last wins.

import {readFileSync} from "node:fs"
import {resolve} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {UsageError} from "./usage-error.ts"

export type Mode = "node" | "browser"

// This package's own names and the addresses the CLI serves them at; a
// target naming one is "bundled", resolved from this package in both modes.
const BUNDLED = new Map([
    ["test-assert-lite", "/@tal/esm/test-assert-lite.mjs"],
    ["test-assert-lite/test", "/@tal/exports/test.mjs"],
    ["test-assert-lite/assert", "/@tal/exports/assert.mjs"],
    ["test-assert-lite/assert/strict", "/@tal/exports/assert/strict.mjs"],
])

/** The addresses a page needs for this package's own names, whatever else is mapped. */
export const bundledAddresses = (): Record<string, string> => Object.fromEntries(BUNDLED)

/** One specifier and its target, as given; the checks a mode adds are `refusal()`. */
export abstract class ImportBase {
    readonly specifier: string
    /** The right-hand side as written. */
    readonly target: string
    /** What a relative target resolves against. */
    protected readonly base: URL

    constructor(specifier: string, target: string, base: URL) {
        this.specifier = specifier
        this.target = target
        this.base = base
    }

    /** `./x`, `../x` or `/x`, or a bare path where the subclass takes one. */
    abstract isPath(): boolean

    /** An absolute URL: one with `://`, or a `data:` URL. */
    isURL(): boolean {
        return /:\/\//.test(this.target) || /^data:/i.test(this.target)
    }

    /** One of this package's own names. */
    isBundled(): boolean {
        return BUNDLED.has(this.target)
    }

    /** Why `mode` cannot take this item, or nothing. */
    abstract refusal(mode: Mode): string | undefined

    /** The local file, absolute: a path against `base`, or a bundled name from this package. Nothing for a URL. */
    getPath(): string | undefined {
        if (this.isBundled()) return fileURLToPath(import.meta.resolve(this.target))
        if (this.isPath()) return this.resolvePath()
        return undefined
    }

    /** A path target as a file; the subclass says by which rules. */
    protected abstract resolvePath(): string

    /** The address a page's import map gets: `serve` turns a file into its served URL. */
    getAddress(serve: (file: string) => string): string {
        const bundled = BUNDLED.get(this.target)
        if (bundled != null) return bundled
        const path = this.getPath()
        return path == null ? this.target : serve(path)
    }

    // A page resolves a key that looks like a URL against its own base and
    // takes a "/" at the end as a prefix; neither means what was written.
    protected keyRefusal(): string | undefined {
        return /^(\.\.?\/|\/)/.test(this.specifier) || this.specifier.endsWith("/") ? "no prefix entry or relative key" : undefined
    }
}

/**
 * An `--alias <specifier>=<target>`: a path, relative to the working
 * directory or absolute; a URL, for a page; or this package's own name.
 * A bare path is a path, as it is for every other file the CLI takes.
 */
export class ImportAliasItem extends ImportBase {
    constructor(entry: string, cwd: URL) {
        const at = entry.indexOf("=")
        if (at < 1 || at === entry.length - 1) throw new UsageError(`--alias takes <specifier>=<target>: ${entry}`)
        super(entry.slice(0, at), entry.slice(at + 1), cwd)
    }

    isPath(): boolean {
        return !this.isURL() && !this.isBundled()
    }

    // By the file system's rules, as the command line's other paths are: a
    // Windows drive letter is a drive, not a URL scheme.
    protected resolvePath(): string {
        return resolve(fileURLToPath(this.base), this.target)
    }

    refusal(mode: Mode): string | undefined {
        if (mode === "node" && this.isURL()) return `--alias: a URL applies to --playwright, --webdriver and --serve only: "${this.specifier}"`
        if (mode === "browser" && this.keyRefusal() != null) return `--alias: ${this.keyRefusal()}: "${this.specifier}"`
        return undefined
    }
}

/**
 * One entry of an import map, read as a page would up to what the CLI can
 * do: a relative address is a file beside the map, "/" and a URL are the
 * page's, a bare name is not an address at all.
 */
export class ImportMapItem extends ImportBase {
    constructor(specifier: string, address: unknown, mapFile: URL) {
        if (typeof address !== "string") throw new UsageError(`--import-map: not a string: "${specifier}"`)
        super(specifier, address, mapFile)
        if (this.keyRefusal() != null || address.endsWith("/")) throw new UsageError(`--import-map: ${this.keyRefusal() ?? "no prefix entry or relative key"}: "${specifier}"`)
        if (!this.isPath() && !this.isURL() && !address.startsWith("/")) throw new UsageError(`--import-map: an address starts with ./, ../, / or a scheme: "${specifier}"`)
    }

    isPath(): boolean {
        return /^\.\.?\//.test(this.target)
    }

    // As a page would, against the map's URL.
    protected resolvePath(): string {
        return fileURLToPath(new URL(this.target, this.base))
    }

    refusal(mode: Mode): string | undefined {
        if (mode === "node" && !this.isPath()) return `--import-map: an address starting with / or a scheme applies to --playwright, --webdriver and --serve only: "${this.specifier}"`
        return undefined
    }
}

// What an import map file holds, as items: "imports" alone, in its order.
export const importMapItems = (map: unknown, mapFile: URL): ImportMapItem[] => {
    if (typeof map !== "object" || map == null || Array.isArray(map)) throw new UsageError("--import-map: not an object")
    for (const key of Object.keys(map)) if (key !== "imports") throw new UsageError(`--import-map: only "imports" is supported: "${key}"`)
    const {imports = {}} = map as {imports?: unknown}
    if (typeof imports !== "object" || imports == null || Array.isArray(imports)) throw new UsageError('--import-map: not an object: "imports"')
    return Object.entries(imports).map(([specifier, address]) => new ImportMapItem(specifier, address, mapFile))
}

/** The items of an import map file, its own location being what a relative address resolves against. */
export const readImportMap = (file: string): ImportMapItem[] => {
    const url = pathToFileURL(file)
    let map: unknown
    try {
        map = JSON.parse(readFileSync(url, "utf8"))
    } catch (error) {
        throw new UsageError(`--import-map: ${error instanceof Error ? error.message : String(error)}`)
    }
    return importMapItems(map, url)
}

// Suites are written against node:test and node:assert, and this package
// stands in for both; these come first, so a later item may take them over.
const defaults = (): ImportAliasItem[] => {
    const cwd = pathToFileURL(`${process.cwd()}/`)
    return ["node:test=test-assert-lite/test", "node:assert=test-assert-lite/assert", "node:assert/strict=test-assert-lite/assert/strict"]
        .map(entry => new ImportAliasItem(entry, cwd))
}

/**
 * The items in the order given, this package's three defaults first, so
 * the last for a specifier wins. Files are every item's, losers included:
 * a file named is watched and served whether or not it is what resolves.
 */
export class Imports {
    readonly items: ImportBase[]

    constructor(items: ImportBase[]) {
        this.items = [...defaults(), ...items]
    }

    /** Every file a path item names, once each, for watching and serving. */
    paths(): string[] {
        return [...new Set(this.items.filter(item => item.isPath()).map(item => item.getPath() as string))]
    }

    /** The item that resolves each specifier: the last one for it. */
    entries(): Map<string, ImportBase> {
        return new Map(this.items.map(item => [item.specifier, item]))
    }

    /** What a page's import map gets: this package's own names, then each specifier's address. */
    addresses(serve: (file: string) => string): Record<string, string> {
        const out = bundledAddresses()
        for (const [specifier, item] of this.entries()) out[specifier] = item.getAddress(serve)
        return out
    }

    /** Why `mode` cannot take the list: one reason per item that resolves and is refused. */
    refusals(mode: Mode): string[] {
        return [...this.entries().values()].map(item => item.refusal(mode)).filter((reason): reason is string => reason != null)
    }
}
