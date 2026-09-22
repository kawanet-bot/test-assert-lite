// A page's console, taken over for a session: each call one line to the
// session's writers, and the methods put back at the end. The methods as
// found also serve as the writers' last resort where there is no process.

import type {TAL} from "test-assert-lite"
import {isError} from "../utils/is-error.ts"
import {stringify} from "../utils/stringify.ts"
import {errorText} from "../utils/tester-error.ts"

type Writer = TAL.Writer
type ConsoleLike = TAL.ConsoleLike

// A string as it is, an Error with its stack, anything else as an
// assertion would show it.
const toString = (v: unknown): string => {
    return "string" === typeof v ? v : isError(v) ? errorText(v) : stringify(v)
}

const consoleLine = (args: unknown[]): string => {
    return `${args.map(toString).join(" ")}\n`
}

// For a console, which adds a newline of its own. Only a string is
// trimmed: at runtime a chunk may be something else.
const trimEnd = (text: string) => {
    if ("string" === typeof text && text.endsWith("\n")) {
        return text.replace(/\n$/, "")
    } else {
        return text
    }
}

// The methods as the session found them, wrappers included, to be called
// on the console they came from.
export const saveConsole = (target: ConsoleLike): ConsoleLike => {
    const {debug, log, info, warn, error} = target
    return {debug, log, info, warn, error}
}

// Writers on the saved methods: where a run's text goes with no process.
export const consoleWriters = (target: ConsoleLike, saved: ConsoleLike): {stdout: Writer, stderr: Writer} => ({
    stdout: {write: text => saved.log.call(target, trimEnd(text))},
    stderr: {write: text => saved.error.call(target, trimEnd(text))},
})

// Takes the five methods over, and returns what puts them back.
export const takeConsole = (target: ConsoleLike, saved: ConsoleLike, stdout: Writer, stderr: Writer): (() => void) => {
    const out = (...args: unknown[]): void => stdout.write(consoleLine(args))
    const err = (...args: unknown[]): void => stderr.write(consoleLine(args))
    target.debug = target.log = target.info = out
    target.warn = target.error = err
    return () => {
        target.debug = saved.debug
        target.log = saved.log
        target.info = saved.info
        target.warn = saved.warn
        target.error = saved.error
    }
}
