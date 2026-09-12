// node:test's shape on this package: the root entry's functions, re-exported
// from the one library instance with `test` as the default. `run` stays on
// the root, since node:test's run() is a file runner, a different thing
// under the same name.
import {after, before, describe, it, suite, test} from "test-assert-lite"

export default test
export {after, before, describe, it, suite, test}
