// Types for test-assert-lite/reporter/tap. The default export is
// a reporter that node --test-reporter also takes.
import type {TAL} from "test-assert-lite"

declare const reporterFn: TAL.ReporterFn

export default reporterFn
