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

const boom = (): never => {
    throw new RangeError("boom")
}

// Every misuse ends in the same TypeError, which is all a caller needs to
// tell it apart from a failed assertion.
const rejected = (fn: () => unknown): void => {
    const error = catchError(fn)
    assert.ok(error instanceof TypeError, "did not reject")
    assert.match(String(error?.message), /invalid arguments/)
}

describe(TITLE, () => {
    it("throws passes on any exception and fails on none", () => {
        assert.doesNotThrow(() => TAL.throws(boom))
        assert.throws(() => TAL.throws(() => undefined), /expected to throw/)
    })

    // node:assert tests the RegExp against String(error), so the name is
    // part of what it sees.
    it("throws matches a RegExp against the error's string form", () => {
        assert.doesNotThrow(() => TAL.throws(boom, /boom/))
        assert.doesNotThrow(() => TAL.throws(boom, /^RangeError: boom$/))
        assert.throws(() => TAL.throws(boom, /nope/), /did not match/)
    })

    it("throws matches an Error class by instanceof", () => {
        assert.doesNotThrow(() => TAL.throws(boom, RangeError))
        assert.doesNotThrow(() => TAL.throws(boom, Error))
        assert.throws(() => TAL.throws(boom, TypeError), /did not match/)
    })

    it("throws accepts a validation function that returns true", () => {
        assert.doesNotThrow(() => TAL.throws(boom, (e: unknown) => e instanceof RangeError))
        assert.throws(() => TAL.throws(boom, () => false), /did not match/)
        // Anything but `true` is a mismatch, as in node:assert.
        assert.throws(() => TAL.throws(boom, () => 1 as never), /did not match/)
    })

    it("throws compares the properties of an object, RegExp values by test", () => {
        assert.doesNotThrow(() => TAL.throws(boom, {message: "boom"}))
        assert.doesNotThrow(() => TAL.throws(boom, {message: /^bo/, name: "RangeError"}))
        assert.throws(() => TAL.throws(boom, {message: "other"}), /did not match/)
        assert.throws(() => TAL.throws(boom, {code: "ERR_X"}), /did not match/)
    })

    // An expected property has to be there, even when its value is undefined,
    // and a primitive carries no properties at all.
    it("throws requires each expected property to be present", () => {
        assert.throws(() => TAL.throws(boom, {code: undefined}), /did not match/)
        assert.throws(() => TAL.throws(() => {
            throw "str"
        }, {message: "str"}), /did not match/)
    })

    it("throws reads an Error instance as an object including name and message", () => {
        assert.doesNotThrow(() => TAL.throws(boom, new RangeError("boom")))
        assert.throws(() => TAL.throws(boom, new Error("boom")), /did not match/)
        assert.throws(() => TAL.throws(boom, new RangeError("other")), /did not match/)
    })

    // node:assert reads a string in the second position as the message.
    it("throws takes a string second argument as the message", () => {
        const missing = catchError(() => TAL.throws(() => undefined, "should have thrown"))
        assert.equal(missing?.name, "AssertionError")
        assert.equal(missing?.message, "should have thrown")
        assert.doesNotThrow(() => TAL.throws(boom, "should have thrown"))
    })

    // A message equal to what was thrown was meant as a matcher, so the call
    // is refused the way node:assert refuses it as ambiguous.
    it("throws refuses a string message identical to the thrown message", () => {
        rejected(() => TAL.throws(boom, "boom"))
        rejected(() => TAL.throws(() => {
            throw "boom"
        }, "boom"))
        // The same text as the third argument is a plain message.
        assert.doesNotThrow(() => TAL.throws(boom, undefined, "boom"))
    })

    it("throws refuses what node:assert refuses", () => {
        rejected(() => TAL.throws("not a function" as never))
        rejected(() => TAL.throws(boom, 123 as never))
        rejected(() => TAL.throws(boom, "one" as never, "two"))
        // Nothing to compare would match anything.
        rejected(() => TAL.throws(boom, {}))
    })

    it("doesNotThrow passes on no exception and fails on one", () => {
        assert.doesNotThrow(() => TAL.doesNotThrow(() => undefined))
        // The original message is part of the failure, to be acted on directly.
        assert.throws(() => TAL.doesNotThrow(boom), /RangeError: boom/)
        assert.throws(() => TAL.doesNotThrow(boom, "note"), /note/)
    })

    // What the filter does not match is passed through, not swallowed.
    it("doesNotThrow only reports what its filter matches", () => {
        assert.throws(() => TAL.doesNotThrow(boom, /boom/), /expected not to throw/)
        assert.throws(() => TAL.doesNotThrow(boom, RangeError), /expected not to throw/)

        assert.ok(catchError(() => TAL.doesNotThrow(boom, /nope/)) instanceof RangeError)
        assert.ok(catchError(() => TAL.doesNotThrow(boom, TypeError)) instanceof RangeError)
    })

    // node:assert takes only a RegExp or a function here; an Error instance
    // or a plain object is a misuse, not a message.
    it("doesNotThrow refuses what node:assert refuses", () => {
        rejected(() => TAL.doesNotThrow("not a function" as never))
        rejected(() => TAL.doesNotThrow(boom, new Error("note") as never))
        rejected(() => TAL.doesNotThrow(boom, {message: "boom"} as never))
    })
})
