#!/usr/bin/env node

// Mocha's CLI loads every test file first and calls run() once at the
// end, since run() only reports whatever has been registered by then.
// This CLI follows the same two-phase shape. Directory search and glob
// expansion are left to the shell on purpose: only explicit file names
// are accepted here, matching the project's "-lite" scope.

import {readFileSync} from "node:fs"
import {register} from "node:module"
import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {run} from "../index.ts"

const USAGE = "Usage: test-assert <file...>\n"

// Suites are written against node:test and node:assert, and this package
// stands in for both: the browser gets that from an import map, Node from
// a resolve hook registered before any suite loads. Inline as data: so
// dist/ carries no extra file.
const HOOK = `let parentURL
export const initialize = (data) => { parentURL = data.parentURL }
export const resolve = (specifier, context, next) =>
    specifier === "node:test" || specifier === "node:assert"
        ? next("test-assert-lite", {...context, parentURL})
        : next(specifier, context)
`

// The hook resolves the package from here rather than from the suite, so
// a suite outside any project, or beside another copy, still lands on the
// instance run() reads. Walking up finds the root from src/ and dist/ alike.
const packageRoot = (): string => {
    for (let dir = new URL("./", import.meta.url); dir.pathname !== "/"; dir = new URL("../", dir)) {
        try {
            if (JSON.parse(readFileSync(new URL("package.json", dir), "utf8")).name === "test-assert-lite") return dir.href
        } catch {
            // no package.json at this level
        }
    }
    throw new Error("test-assert-lite: package root not found")
}

const files = process.argv.slice(2)

if (files.includes("-h") || files.includes("--help")) {
    process.stdout.write(USAGE)
    process.exit(0)
}

if (!files.length) {
    process.stderr.write(USAGE)
    process.exit(1)
}

// The hook below only sees ESM resolution; a require() bypasses it and
// registers with Node's own runner. Suites are ES modules, so refuse the
// extensions that can only be CommonJS up front.
const commonjs = files.filter(file => /\.c[jt]s$/.test(file))
if (commonjs.length) {
    process.stderr.write(`CommonJS suites are not supported: ${commonjs.join(", ")}\n`)
    process.exit(1)
}

register(`data:text/javascript,${encodeURIComponent(HOOK)}`, {data: {parentURL: packageRoot()}})

for (const file of files) {
    await import(pathToFileURL(resolve(file)).href)
}

process.exitCode = (await run()).success ? 0 : 1
