import type * as declared from "test-assert-lite"
import {errorText, isSubtestsFailed} from "./common/test-failure.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn

const AMP = {"<": "&lt;", "&": "&amp;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"} as const

const escapeHTML = (v: string): string => v.replace(/([<&>"'])/g, $1 => AMP[$1 as keyof typeof AMP])

const space = (nesting: number): string => "&nbsp;&nbsp;".repeat(nesting)

const resultLine = (data: declared.TAL.TestPass | declared.TAL.TestFail, isPass: boolean, indented: boolean): string => {
    const skipped = data.skip != null
    const kind = skipped ? "skip" : isPass ? "pass" : "fail"
    const symbol = skipped ? "﹣" : isPass ? "✔" : "✖"
    const note = "string" === typeof data.skip ? ` # ${escapeHTML(data.skip)}` : skipped ? " # SKIP" : ""
    const prefix = indented ? space(data.nesting) : ""
    return `<div>${prefix}<span class="tal tal-${kind}">${symbol} ${escapeHTML(data.name)}</span> <span class="tal tal-info">(${data.details.duration_ms.toFixed(3)}ms)</span>${note}</div>\n`
}

const formatFailures = (failed: declared.TAL.TestFail[]): string => {
    if (!failed.length) return ""
    let out = `<div class="tal tal-fail">✖ failing tests:</div>\n`
    for (const data of failed) {
        out += resultLine(data, false, false)
        out += `<div class="tal tal-error"><pre>${escapeHTML(errorText(data.details.error))}</pre></div>\n`
    }
    return out
}

// Produces list items only, leaving the surrounding list and output target
// to the page so applications can place the report in their own layout.
export const html = (): FormatFn => async function* (source: AsyncIterable<TestEvent>): AsyncIterable<string> {
    const stack: declared.TAL.TestStart[] = []
    const failed: declared.TAL.TestFail[] = []

    for await (const event of source) {
        if (event.type === "test:start") {
            stack.unshift(event.data)
            continue
        }

        if (event.type === "test:diagnostic") {
            const {level, nesting, message} = event.data
            yield `<div>${space(nesting)}<span class="tal tal-${escapeHTML(level)}">ℹ ${escapeHTML(message)}</span></div>\n`
            continue
        }

        if (event.type === "test:summary") {
            yield formatFailures(failed)
            failed.length = 0
            continue
        }

        const isPass = event.type === "test:pass"
        const isFail = event.type === "test:fail"
        if (!isPass && !isFail) continue

        const data = event.data
        let out = ""
        if (stack.length && stack[0]?.name === data.name) stack.shift()
        while (stack.length) {
            const parent = stack.pop()!
            out += `<div>${space(parent.nesting)}<span class="tal tal-suite">▶ ${escapeHTML(parent.name)}</span></div>\n`
        }
        out += resultLine(data, isPass, true)
        if (isFail) {
            const failure = data as declared.TAL.TestFail
            if (!isSubtestsFailed(failure.details.error)) failed.push(failure)
        }
        yield out
    }

    yield formatFailures(failed)
}
