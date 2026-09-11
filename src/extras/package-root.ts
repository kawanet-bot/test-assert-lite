// Package roots, found by walking up to a package.json: this package's
// own, by name, from wherever this code runs, src/extras/ or esm/, so
// that what the CLI serves or resolves hangs off this copy; and a suite's,
// the nearest named one above it, for the name a page shows.

import {readFileSync} from "node:fs"
import {dirname} from "node:path"
import {pathToFileURL} from "node:url"

// The nearest package.json above `from` that `wanted` takes, with its
// directory; one that cannot be read is no package.
const packageAbove = (from: URL, wanted: (name: unknown) => boolean): {dir: URL, name: string} | undefined => {
    for (let dir = from; dir.pathname !== "/"; dir = new URL("../", dir)) {
        try {
            const {name} = JSON.parse(readFileSync(new URL("package.json", dir), "utf8")) as {name?: unknown}
            if (wanted(name)) return {dir, name: String(name)}
        } catch {
            // no package.json at this level
        }
    }
    return undefined
}

export const packageRoot = (): URL => {
    const own = packageAbove(new URL("./", import.meta.url), name => name === "test-assert-lite")
    if (own == null) throw new Error("test-assert-lite: package root not found")
    return own.dir
}

/** The name of the nearest package above `file`, or none when no package.json up there names one. */
export const packageNameOf = (file: string): string | undefined =>
    packageAbove(pathToFileURL(`${dirname(file)}/`), name => typeof name === "string" && name !== "")?.name
