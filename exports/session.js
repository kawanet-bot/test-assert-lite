// The session's own entry: opening it, loading the suites into it, and
// running it, from the shared harness. No default: node has no such module.
import {sharedTAL} from "test-assert-lite"

export const {connect, load, run, session} = sharedTAL.session
