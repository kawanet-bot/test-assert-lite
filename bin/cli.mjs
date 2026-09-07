#!/usr/bin/env node

// The executable: hands the arguments to CLI() from the extras entry and
// turns what it resolves to into the exit code. exitCode rather than
// exit(), so output still on its way to a pipe is not cut off.

import {CLI} from "test-assert-lite/extras"

CLI({args: process.argv.slice(2)})
    .catch(error => {
        console.error(error)
        return 1
    })
    .then(code => {
        process.exitCode = code
    })
