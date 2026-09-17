import type {TAL} from "test-assert-lite"
import {VERSION} from "../utils/version.ts"

type TestEvent = TAL.TestEvent
type ReporterFn = TAL.ReporterFn

const info = (label: string, value: number | string): TestEvent => ({
    type: "test:diagnostic",
    data: {message: `${label} ${value}`, nesting: 0, level: "info"},
})

// The lines after the tests, ahead of the summary event they are drawn
// from: node:test's summary in words, then what it never says, which
// package ran the suites and where. A wrapper on the events, so the
// runner writes none of them and a session can leave them off.
export const withFooter = (reporter: ReporterFn): ReporterFn => source => reporter((async function* () {
    for await (const event of source) {
        if (event.type === "test:summary") {
            const {counts, duration_ms} = event.data
            yield info("tests", counts.tests)
            yield info("suites", counts.suites)
            yield info("pass", counts.passed)
            yield info("fail", counts.failed)
            yield info("cancelled", counts.cancelled)
            yield info("skipped", counts.skipped)
            yield info("todo", counts.todo)
            yield info("duration_ms", duration_ms)
            yield info("test-assert-lite", VERSION)
            const userAgent = globalThis.navigator?.userAgent
            if (userAgent) {
                yield info("user-agent", userAgent)
            }
        }
        yield event
    }
})())
