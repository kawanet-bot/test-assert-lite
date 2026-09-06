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

// Closing a per-run ReportStream is an internal step driven by run(), so it comes
// back on a separate handle rather than on the public Reporter.
export interface ReporterControl {
    reporter: declared.TAL.Reporter
    begin: () => Promise<void>
    close: () => Promise<void>
}

export const createReporter = (): ReporterControl => {
    let format: FormatFn = spec()
    let output: OutputFn = defaultOutput
    let stream: ReportStream | null = null

    // Standalone events follow the latest output setting. A run replaces
    // this ReportStream with one that holds its startup snapshot directly.
    const current = (): ReportStream => stream ??= new ReportStream(format, text => output(text))
    const close = async (): Promise<void> => {
        const active = stream
        if (active == null) return
        try {
            await active.close()
        } finally {
            if (stream === active) stream = null
        }
    }

    return {
        reporter: {
            emit: (type, data) => current().emit({type, data} as TestEvent),
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
        // A standalone emit() may have opened a ReportStream with older settings.
        // Finish it before snapshotting the current configuration for run().
        begin: async () => {
            // Its own emit() already owns any failure. A new run starts a
            // separate session and must not inherit that previous error.
            try {
                await close()
            } catch {
                // discarded standalone session
            }
            stream = new ReportStream(format, output)
        },
        close,
    }
}
