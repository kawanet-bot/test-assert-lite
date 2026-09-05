import type * as declared from "test-assert-lite"

import {isError} from "./common/is-error.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn

const SYMBOL = {
    pass: "✔ ",
    fail: "✖ ",
    skip: "﹣ ",
    info: "ℹ ",
    suite: "▶ ",
} as const

const COLOR = {
    green: "\u001b[32m",
    red: "\u001b[31m",
    blue: "\u001b[34m",
    yellow: "\u001b[33m",
    gray: "\u001b[90m",
    reset: "\u001b[39m",
} as const

// Node honours NO_COLOR / NODE_DISABLE_COLORS. A browser has no notion of
// terminal colour, so it is always off there. Keeping the decision in one
// place gives spec() its default.
const defaultColors = (): boolean => {
    const env = "undefined" !== typeof process && (process as {env?: Record<string, string | undefined>}).env
    return !!env && (!env.NO_COLOR && !env.NODE_DISABLE_COLORS)
}

const indent = (nesting: number): string => "  ".repeat(nesting)

const paint = (on: boolean, color: string, text: string): string => on ? `${color}${text}${COLOR.reset}` : text

const errorText = (error: unknown): string => {
    if (isError(error)) return error.stack ?? `${error.name}: ${error.message}`
    return String(error)
}

const formatFailures = (failed: declared.TAL.TestFail[], colors: boolean): string => {
    if (!failed.length) return ""
    let out = "\n" + paint(colors, COLOR.red, `${SYMBOL.fail}failing tests:`) + "\n"
    for (const data of failed) {
        out += "\n" + paint(colors, COLOR.red, `${SYMBOL.fail}${data.name}`) + "\n"
        out += "  " + errorText(data.details.error).replace(/\n/g, "\n  ") + "\n"
    }
    return out
}

export const spec = (options?: declared.TAL.SpecOptions): FormatFn => {
    const colors = options?.colors ?? defaultColors()

    return async function* (source: AsyncIterable<TestEvent>): AsyncIterable<string> {
        // Stack up test:start and, once a result arrives, emit the parents
        // still pending as headings. This is how node:test's spec builds it.
        const stack: declared.TAL.TestStart[] = []
        const failed: declared.TAL.TestFail[] = []

        for await (const event of source) {
            if (event.type === "test:start") {
                stack.unshift(event.data)
                continue
            }

            if (event.type === "test:diagnostic") {
                const {level, nesting, message} = event.data
                const color = level === "error" ? COLOR.red : level === "warn" ? COLOR.yellow : COLOR.blue
                yield paint(colors, color, `${indent(nesting)}${SYMBOL.info}${message}`) + "\n"
                continue
            }

            if (event.type === "test:summary") {
                yield formatFailures(failed, colors)
                failed.length = 0
                continue
            }

            // emit() accepts any type, so check for a result event rather
            // than assuming one. An unknown type is dropped, as it is in
            // node:test's spec.
            const isPass = event.type === "test:pass"
            const isFail = event.type === "test:fail"
            if (!isPass && !isFail) continue

            const data = event.data
            let out = ""

            // Drop this test's own start, then turn the remaining parents into headings
            if (stack.length && stack[0]?.name === data.name) stack.shift()
            while (stack.length) {
                const parent = stack.pop()!
                out += paint(colors, COLOR.gray, `${indent(parent.nesting)}${SYMBOL.suite}${parent.name}`) + "\n"
            }

            const skipped = data.skip != null
            const symbol = skipped ? SYMBOL.skip : isPass ? SYMBOL.pass : SYMBOL.fail
            const color = skipped ? COLOR.gray : isPass ? COLOR.green : COLOR.red
            const note = "string" === typeof data.skip ? ` # ${data.skip}` : skipped ? " # SKIP" : ""
            const ms = paint(colors, COLOR.gray, ` (${data.details.duration_ms.toFixed(3)}ms)`)
            out += paint(colors, color, `${indent(data.nesting)}${symbol}${data.name}`) + ms + note + "\n"

            if (isFail) failed.push(event.data)
            yield out
        }

        // End of stream, so the failure list still appears for a caller that
        // never emits test:summary.
        yield formatFailures(failed, colors)
    }
}
