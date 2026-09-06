import type * as declared from "test-assert-lite"
import {errorText} from "../common/stringify.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn

// A bare "#" starts a TAP directive and a raw newline starts a new TAP
// line, so both need escaping to keep one test point on one line.
const escapeText = (text: string): string => text.replace(/#/g, "\\#").replace(/\n/g, "\\n")

const skipDirective = (skip: string | boolean | undefined): string => {
    if (skip == null) return ""
    return "string" === typeof skip ? ` # SKIP ${escapeText(skip)}` : " # SKIP"
}

// A skip called from a body that then throws still fails the point (node's
// own TAP does the same), so the verdict only depends on pass vs fail.
const resultLine = (data: declared.TAL.TestPass | declared.TAL.TestFail, isPass: boolean, number: number): string =>
    `${isPass ? "ok" : "not ok"} ${number} - ${escapeText(data.name)}${skipDirective(data.skip)}`

// Plain "#" comment lines rather than a YAML block: valid TAP that any
// consumer can skip, without this package taking on a YAML encoder.
const diagnostic = (error: Error): string =>
    errorText(error).split("\n").map((line) => `# ${line}`).join("\n") + "\n"

export const tap = (): FormatFn => async function* (source: AsyncIterable<TestEvent>): AsyncIterable<string> {
    // Mirrors spec()/html(): stack up test:start and, once a result
    // arrives, emit the parents still pending as headings.
    const stack: declared.TAL.TestStart[] = []
    let number = 0

    yield "TAP version 13\n"

    for await (const event of source) {
        if (event.type === "test:start") {
            stack.unshift(event.data)
            continue
        }

        // Forwarded as is, run() count and all: TAP has no standard summary
        // syntax of its own, so there is no fixed shape here to duplicate.
        if (event.type === "test:diagnostic") {
            yield `# ${escapeText(event.data.message)}\n`
            continue
        }

        // emit() accepts any type, so check for a result event rather than
        // assuming one. test:summary and an unknown type both fall through
        // and are dropped, as node:test's own reporters drop unknown ones.
        const isPass = event.type === "test:pass"
        const isFail = event.type === "test:fail"
        if (!isPass && !isFail) continue

        const data = event.data
        if (stack.length && stack[0]?.name === data.name) stack.shift()
        while (stack.length) {
            const parent = stack.pop()!
            yield `# ${escapeText(parent.name)}\n`
        }

        number++
        yield resultLine(data, isPass, number) + "\n"
        if (event.type === "test:fail") yield diagnostic(event.data.details.error)
    }

    yield `1..${number}\n`
}
