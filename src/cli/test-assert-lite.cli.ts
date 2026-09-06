#!/usr/bin/env node

// Mocha's CLI loads every test file first and calls run() once at the
// end, since run() only reports whatever has been registered by then.
// This CLI follows the same two-phase shape. Directory search and glob
// expansion are left to the shell on purpose: only explicit file names
// are accepted here, matching the project's "-lite" scope.

import {resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {run} from "../index.ts"

const USAGE = "Usage: test-assert <file...>\n"

const files = process.argv.slice(2)

if (files.includes("-h") || files.includes("--help")) {
    process.stdout.write(USAGE)
    process.exit(0)
}

if (!files.length) {
    process.stderr.write(USAGE)
    process.exit(1)
}

for (const file of files) {
    await import(pathToFileURL(resolve(file)).href)
}

process.exitCode = (await run()).success ? 0 : 1
