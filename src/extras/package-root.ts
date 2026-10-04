// Package roots, found by walking up to a package.json: this package and
// the library it serves, each by name from where Node resolves it, so
// the sources under test and the built copy both find the installed one.
// A suite has one too, the nearest named one above it, for a page to show.

import {readFileSync} from "node:fs"
import {dirname} from "node:path"
import {pathToFileURL} from "node:url"

// The nearest package.json above `from` that `wanted` takes, with its
// directory; one that cannot be read is no package. The walk ends where
// going up changes nothing: "/" on POSIX, a drive root on Windows.
const packageAbove = (from: URL, wanted: (name: unknown) => boolean): {dir: URL, name: string} | undefined => {
    for (let dir = from; ; dir = new URL("../", dir)) {
        try {
            const {name} = JSON.parse(readFileSync(new URL("package.json", dir), "utf8")) as {name?: unknown}
            if (wanted(name)) return {dir, name: String(name)}
        } catch {
            // no package.json at this level
        }
        if (new URL("../", dir).href === dir.href) return undefined
    }
}

// A package root, from where Node resolves the name to, so the sources
// under test and the built copy both find the installed one.
const rootOf = (name: string): URL => {
    const entry = new URL("./", import.meta.resolve(name))
    const found = packageAbove(entry, found => found === name)
    if (found == null) throw new Error(`${name}: package root not found`)
    return found.dir
}

/** This package: the pages it serves hang off it. */
export const packageRoot = (): URL => rootOf("test-assert-cli")

/** The library a page is served: its dist/ and exports/ hang off it. */
export const libraryRoot = (): URL => rootOf("test-assert-lite")

/** The name of the nearest package above `file`, or none when no package.json up there names one. */
export const packageNameOf = (file: string): string | undefined =>
    packageAbove(pathToFileURL(`${dirname(file)}/`), name => typeof name === "string" && name !== "")?.name
