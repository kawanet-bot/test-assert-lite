import type * as declared from "test-assert-lite"
import {html} from "./reporter/html.ts"
import {ReportStream} from "./reporter/report-stream.ts"
import {spec} from "./reporter/spec.ts"
import {tap} from "./reporter/tap.ts"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn

const defaultOutput: OutputFn = (text) => {
    // console.log adds its own newline, so drop the trailing one
    console.log(text.replace(/\n$/, ""))
}

// What run() drives: events go in through emit(), between begin() and
// close(). The public Reporter carries the settings only, as node:test
// gives a test no way to send an event of its own either.
export interface ReporterControl {
    reporter: declared.TAL.Reporter
    emit: (type: string, data: TestEvent["data"]) => Promise<void>
    begin: () => void
    close: () => Promise<void>
}

export const createReporter = (): ReporterControl => {
    let format: FormatFn = spec()
    let output: OutputFn = defaultOutput
    // Each run gets a fresh ReportStream holding the settings as they were
    // when it began. This first one only stands in until then.
    let stream = new ReportStream(format, output)

    return {
        reporter: {
            // Configuration belongs to the TAL instance. Each run creates a
            // fresh ReportStream and formatter consumer from these retained values.
            format: (fn) => {
                format = fn
            },
            output: (fn) => {
                output = fn
            },
            spec,
            tap,
            html,
        },
        emit: (type, data) => stream.emit({type, data} as TestEvent),
        begin: () => {
            stream = new ReportStream(format, output)
        },
        close: () => stream.close(),
    }
}
