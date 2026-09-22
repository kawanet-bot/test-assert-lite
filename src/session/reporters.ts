// What a session reports with: the reporter named or given, spec unless
// one is, the footer on top unless quiet, and a module name imported when
// the run starts reporting.

import type {TAL} from "test-assert-lite"
import {html} from "../reporter/html.ts"
import {spec} from "../reporter/spec.ts"
import {tap} from "../reporter/tap.ts"
import {withFooter} from "./footer.ts"
import type {HarnessState} from "./state.ts"

type ReporterFn = TAL.ReporterFn
type SessionOptions = TAL.SessionOptions

const reporterMap = new Map<string, () => ReporterFn>([
    ["html", html],
    ["spec", spec],
    ["tap", tap],
])

// A module name is imported when the run starts reporting, its default
// export the reporter, as node --test-reporter takes one. A name that
// does not import, or starts with "." and would resolve against this
// module, is a failed test at the root, and the run goes on with spec.
const lazyReporter = (harness: HarnessState, v: string): ReporterFn => {
    return async function* (source) {
        let error: Error | null = null
        const module = /^\./.test(v) ? null : await import(v).catch((e: Error) => (void (error = e)))
        let reporter: unknown = module?.default
        if (error || "function" !== typeof reporter) {
            harness.root.declareTest(`import(${JSON.stringify(v)})`, {}, () => {
                throw error || new Error(`unsupported reporter: ${v}`)
            })
            reporter = spec()
        }
        yield* (reporter as ReporterFn)(source)
    }
}

const reporterOf = (harness: HarnessState, v: ReporterFn | string | undefined): ReporterFn | undefined => {
    if (!v) return undefined
    if ("function" === typeof v) return v
    const init = reporterMap.get(v)
    if (init) return init()
    return lazyReporter(harness, v)
}

// The footer is the session's to leave off, for a script that is no suite.
export const chooseReporter = (harness: HarnessState, options: SessionOptions): ReporterFn => {
    const named = reporterOf(harness, options.reporter) ?? spec({quiet: options.quiet})
    return options.quiet ? named : withFooter(named)
}
