import type * as declared from "test-assert-lite"
import {client} from "./reporter/client.ts"
import {html} from "./reporter/html.ts"
import {ReportStream} from "./reporter/report-stream.ts"
import {spec} from "./reporter/spec.ts"
import {tap} from "./reporter/tap.ts"

type FormatFn = declared.TAL.FormatFn
type OutputFn = declared.TAL.OutputFn

const defaultOutput: OutputFn = (text) => {
    // console.log adds its own newline, so drop the trailing one
    console.log(text.replace(/\n$/, ""))
}

// What the runner drives: a stream per cycle, attached to the settings
// when run() reports. The public Reporter
// carries the settings only, as node:test gives a test no way to send an
// event of its own either.
export interface ReporterControl {
    reporter: declared.TAL.Reporter
    open: () => ReportStream
    attach: (stream: ReportStream) => void
}

export const createReporter = (): ReporterControl => {
    let format: FormatFn = spec()
    let output: OutputFn = defaultOutput

    return {
        reporter: {
            // Configuration belongs to the TAL instance. Each run attaches
            // its stream to these values as they stand at that moment.
            format: (fn) => {
                format = fn
            },
            output: (fn) => {
                output = fn
            },
            spec,
            tap,
            html,
            client,
        },
        open: () => new ReportStream(),
        attach: (stream) => stream.attach(format, output),
    }
}
