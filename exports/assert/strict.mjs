// node:assert/strict's shape on this package: the strict assert as the
// default and its methods as named exports, so `equal` here is the strict
// one, as in node. From the one library instance; ES modules only.
import {strict} from "../../dist/test-assert-lite.mjs"

export default strict
export {strict}
export const {
    deepEqual,
    deepStrictEqual,
    doesNotMatch,
    doesNotThrow,
    equal,
    fail,
    ifError,
    match,
    notDeepEqual,
    notDeepStrictEqual,
    notEqual,
    notStrictEqual,
    ok,
    strictEqual,
    throws,
} = strict
