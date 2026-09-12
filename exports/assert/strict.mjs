// node:assert/strict's shape on this package: the strict assert as the
// default and its methods as named exports, so `equal` here is the strict
// one, as in node. From the one library instance; ES modules only.
import {strict} from "test-assert-lite"

export default strict
export {strict}
export const {
    deepEqual,
    deepStrictEqual,
    doesNotMatch,
    doesNotReject,
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
    rejects,
    strictEqual,
    throws,
} = strict
