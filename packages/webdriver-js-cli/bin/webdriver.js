#!/usr/bin/env node

// The executable: tacli fixed on a WebDriver server, under this package's
// name and version. exitCode rather than exit(), so output still on its
// way to a pipe is not cut off.

import {CLI} from "test-assert-cli"
import pkg from "../package.json" with {type: "json"}

CLI({
    args: process.argv.slice(2),
    program: {command: "webdriver-js", name: pkg.name, version: pkg.version},
    webdriver: true,
})
    .catch(error => {
        console.error(error)
        return 1
    })
    .then(code => {
        process.exitCode = code
    })
