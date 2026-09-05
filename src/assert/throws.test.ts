import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {strict as TAL} from "./../index.ts"

const TITLE = "assert/throws.test.ts"

const catchError = (fn: () => unknown): Error | undefined => {
    try {
        fn()
        return undefined
    } catch (e) {
        return e as Error
    }
}

describe(TITLE, () => {
    it("throws accepts a RegExp", () => {
        assert.doesNotThrow(() => TAL.throws(() => {
            throw new Error("boom")
        }, /boom/))
        assert.throws(() => TAL.throws(() => {
            throw new Error("boom")
        }, /nope/), /did not match/)
        assert.throws(() => TAL.throws(() => undefined), /expected to throw/)
    })

    // Calling a non-function raises a TypeError that throws() would read as
    // the expected exception, letting a test that asserts nothing go green.
    it("both reject a first argument that is not a function", () => {
        for (const value of ["str", 1, true, [], {}, /foo/, null, undefined]) {
            const thrown = catchError(() => TAL.throws(value as never))
            assert.ok(thrown instanceof TypeError, `throws(${String(value)}) did not reject`)
            assert.match(String(thrown.message), /requires a function/)

            const notThrown = catchError(() => TAL.doesNotThrow(value as never))
            assert.ok(notThrown instanceof TypeError, `doesNotThrow(${String(value)}) did not reject`)
            assert.match(String(notThrown.message), /requires a function/)
        }
    })

    it("throws rejects a non-RegExp matcher", () => {
        const error = catchError(() => TAL.throws(() => {
            throw new Error("x")
        }, Error as never))
        assert.ok(error instanceof TypeError)
        assert.match(String(error?.message), /RegExp/)
    })

    it("doesNotThrow surfaces the original message", () => {
        assert.throws(() => TAL.doesNotThrow(() => {
            throw new Error("inner")
        }), /inner/)
        assert.throws(() => TAL.doesNotThrow(() => {
            throw new Error("inner")
        }, "note"), /note/)
    })

    // What the filter does not match is passed through, not swallowed.
    it("doesNotThrow only reports what its RegExp matches", () => {
        assert.throws(() => TAL.doesNotThrow(() => {
            throw new Error("inner")
        }, /inner/), /expected not to throw/)

        const passed = catchError(() => TAL.doesNotThrow(() => {
            throw new RangeError("inner")
        }, /nope/))
        assert.ok(passed instanceof RangeError)
    })

    // Swallowing an error class as the message would report it as
    // "function TypeError() { [native code] }", which helps nobody.
    it("doesNotThrow rejects a non-RegExp matcher", () => {
        const error = catchError(() => TAL.doesNotThrow(() => undefined, Error as never))
        assert.ok(error instanceof TypeError)
        assert.match(String(error?.message), /RegExp/)
    })

})
