// node:assert's shape on this package: the loose assert as the default, its
// methods as named exports and `strict` beside them, all from the one
// library instance. ES modules only: require() gets this namespace, not
// the function itself as it would from node:assert.
import {assert, strict} from "../dist/test-assert-lite.mjs"

export default assert
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
} = assert
