// node:assert's shape on this package: the loose assert as the default, its
// methods as named exports and `strict` beside them, all from the shared
// harness. ES modules only: require() gets this namespace, not the
// function itself as it would from node:assert.
import {sharedTAL} from "test-assert-lite"

const assert = sharedTAL.assert

export default assert
export const {strict} = assert
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
} = assert
