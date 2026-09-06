import type * as declared from "test-assert-lite"
import {errorText} from "../common/stringify.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn

// A TAP line is exactly one line, so a name or message crossing several
// would otherwise break the line it is written into.
const oneLine = (text: string): string => text.replace(/\r?\n/g, " ")

// SKIP always reports "ok": the test was never run, so it cannot have
// failed either - the same rule node:test's own skip mechanism follows.
const resultLine = (data: declared.TAL.TestPass | declared.TAL.TestFail, isPass: boolean, testNumber: number): string => {
    if (data.skip != null) {
        const reason = "string" === typeof data.skip ? ` ${data.skip}` : ""
        return `ok ${testNumber} - ${oneLine(data.name)} # SKIP${reason}\n`
    }
    return `${isPass ? "ok" : "not ok"} ${testNumber} - ${oneLine(data.name)}\n`
}

// One key is enough for external tooling that reads this block; node:test's
// own dump of every Error property is detail this reporter does not match.
const errorBlock = (error: Error): string => `  ---\n  message: ${JSON.stringify(oneLine(errorText(error)))}\n  ...\n`

// node:test's own event carries this beyond what TAL's own summary does;
// reading it is how the final, whole-run summary is told apart below.
const fileOf = (data: object): string | undefined => (data as {file?: string}).file

export const tap = (): FormatFn => async function* (source: AsyncIterable<TestEvent>): AsyncIterable<string> {
    let testNumber = 0
    let counts: declared.TAL.TestSummary["counts"] | undefined

    yield "TAP version 13\n"

    for await (const event of source) {
        if (event.type === "test:start") {
            yield `# Subtest: ${oneLine(event.data.name)}\n`
            continue
        }

        if (event.type === "test:diagnostic") {
            yield `# ${oneLine(event.data.message)}\n`
            continue
        }

        if (event.type === "test:summary") {
            // node:test emits one of these per file plus a final one for
            // the whole run; only the file-less final one is kept, so the
            // totals below always match what node:test itself reports.
            if (fileOf(event.data) == null) counts = event.data.counts
            continue
        }

        const isPass = event.type === "test:pass"
        const isFail = event.type === "test:fail"
        if (!isPass && !isFail) continue

        // A suite is reported the same way as a test, but counting it too
        // would double what node:test's own tests/pass/fail tally shows.
        const data = event.data
        if (data.details.type !== "test") continue

        testNumber++
        yield resultLine(data, isPass, testNumber)
        if (isFail && data.skip == null) yield errorBlock(event.data.details.error)
    }

    // The plan is written last rather than as `1..N` up front: the total
    // isn't known until the stream ends, and TAP allows either position.
    yield `1..${testNumber}\n`
    if (counts) {
        yield `# tests ${counts.tests}\n`
        yield `# pass ${counts.passed}\n`
        yield `# fail ${counts.failed}\n`
        yield `# skip ${counts.skipped}\n`
    }
}
