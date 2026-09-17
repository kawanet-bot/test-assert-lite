// Declarations for assert.js: the shared harness's `assert` and `strict`,
// and each method typed off the Assert interface so it cannot drift from it.
import type {TAL} from "test-assert-lite"

type Assert = TAL.Assert

declare const assert: Assert
export default assert
export declare const strict: Assert
export declare const deepEqual: Assert["deepEqual"]
export declare const deepStrictEqual: Assert["deepStrictEqual"]
export declare const doesNotMatch: Assert["doesNotMatch"]
export declare const doesNotReject: Assert["doesNotReject"]
export declare const doesNotThrow: Assert["doesNotThrow"]
export declare const equal: Assert["equal"]
export declare const fail: Assert["fail"]
export declare const ifError: Assert["ifError"]
export declare const match: Assert["match"]
export declare const notDeepEqual: Assert["notDeepEqual"]
export declare const notDeepStrictEqual: Assert["notDeepStrictEqual"]
export declare const notEqual: Assert["notEqual"]
export declare const notStrictEqual: Assert["notStrictEqual"]
export declare const ok: Assert["ok"]
export declare const rejects: Assert["rejects"]
export declare const strictEqual: Assert["strictEqual"]
export declare const throws: Assert["throws"]
