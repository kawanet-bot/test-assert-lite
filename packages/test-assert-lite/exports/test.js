// node:test's shape: the test entry of sharedTAL, with `test` as the
// default. No `run`: node:test's run() is a file runner, another thing.
import {sharedTAL} from "test-assert-lite"

export const {after, before, describe, it, suite, test} = sharedTAL.test
export default test
