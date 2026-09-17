// node:test's shape on this package: the shared harness's functions, with
// `test` as the default. `run` is left out, since node:test's run() is a
// file runner, a different thing under the same name.
import {sharedTAL} from "test-assert-lite"

export const {after, before, describe, it, suite, test} = sharedTAL.test
export default test
