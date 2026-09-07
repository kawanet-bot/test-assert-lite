// The package root as a file: URL ending in "/", found by walking up from
// wherever this code runs, src/extras/ or dist/, to the package.json that
// carries this package's name. What the CLI serves or resolves hangs off
// it, so a suite anywhere on disk still lands on this copy of the package.

import {readFileSync} from "node:fs"

export const packageRoot = (): URL => {
    for (let dir = new URL("./", import.meta.url); dir.pathname !== "/"; dir = new URL("../", dir)) {
        try {
            if (JSON.parse(readFileSync(new URL("package.json", dir), "utf8")).name === "test-assert-lite") return dir
        } catch {
            // no package.json at this level
        }
    }
    throw new Error("test-assert-lite: package root not found")
}
