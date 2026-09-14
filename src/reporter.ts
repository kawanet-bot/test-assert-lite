import type * as declared from "test-assert-lite"
import {html} from "./reporter/html.ts"
import {spec} from "./reporter/spec.ts"
import {tap} from "./reporter/tap.ts"

// The formatters the package ships. What a run reports with is the
// session's to hold, so nothing here carries state.
export const reporter: declared.TAL.Reporter = {spec, tap, html}
