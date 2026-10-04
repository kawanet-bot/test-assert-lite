// The session's own entry: opening it, loading the suites into it, and
// running it, from the shared harness. There is no default export. Node has
// no module like this one.
import {sharedTAL} from "test-assert-lite"

export const {load, run, session} = sharedTAL.session
