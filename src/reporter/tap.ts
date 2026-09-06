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
    let summary: declared.TAL.TestSummary | undefined

    yield "TAP version 13\n"

    for await (const event of source) {
        if (event.type === "test:start") {
            stack.unshift(event.data)
            continue
        }

        // Recorded for the trailing summary line, not forwarded as a
        // comment: node:test emits one of these per file plus one for the
        // whole run, and only the last carries the true combined counts.
        if (event.type === "test:summary") {
            summary = event.data
            continue
        }

        // emit() accepts any type, so check for a result event rather than
        // assuming one. An unknown type is dropped, as node:test's own
        // reporters do.
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

    // Silently omitted without a summary: a caller that only emits
    // standalone events never produces one, and node:test's own tap
    // reporter has nothing to print in that case either.
    if (summary) {
        const {counts} = summary
        yield `# tests ${counts.tests}\n`
        yield `# suites ${counts.suites}\n`
        yield `# pass ${counts.passed}\n`
        yield `# fail ${counts.failed}\n`
        yield `# cancelled ${counts.cancelled}\n`
        yield `# skipped ${counts.skipped}\n`
        yield `# duration_ms ${summary.duration_ms}\n`
    }
}
