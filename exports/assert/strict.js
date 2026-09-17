// node:assert/strict's shape on this package: the strict assert as the
// default and its methods as named exports, so `equal` here is the strict
// one, as in node. From the shared harness; ES modules only.
import {sharedTAL} from "test-assert-lite"

export const {strict} = sharedTAL
export default strict
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
