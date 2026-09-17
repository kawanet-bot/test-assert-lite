import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {sharedTAL} from "../index.ts"

const TAL_assert = sharedTAL.assert
const TAL_strict = sharedTAL.assert.strict

const TITLE = "assert/assert.test.ts"

const catchError = (fn: () => unknown): Error | undefined => {
    try {
        fn()
        return undefined
    } catch (e) {
        return e as Error
    }
}

// An Error that arrives from an iframe or a worker has a different
// constructor, so instanceof says no. Replacing the prototype reproduces
// that state without a vm, which keeps this runnable in a browser.
const foreignError = (message: string): Error => {
    const error = new TypeError(message)
    Object.setPrototypeOf(error, {name: "TypeError"})
    return error
}
describe(TITLE, () => {
    it("callable form works as ok", () => {
        assert.doesNotThrow(() => TAL_strict(1))
        assert.throws(() => TAL_strict(0), /expected truthy/)
    })

    it("ok", () => {
        assert.doesNotThrow(() => TAL_strict.ok("x"))
        assert.throws(() => TAL_strict.ok(""), /expected truthy/)
        assert.throws(() => TAL_strict.ok(false, "custom"), /custom/)
    })

    it("equal uses Object.is semantics", () => {
        assert.doesNotThrow(() => TAL_strict.equal(NaN, NaN))
        assert.throws(() => TAL_strict.equal(0, -0))
        assert.throws(() => TAL_strict.equal("a", "b"), /expected "b", got "a"/)
    })

    it("strictEqual is an alias of equal", () => {
        assert.equal(TAL_strict.strictEqual, TAL_strict.equal)
        assert.equal(TAL_strict.notStrictEqual, TAL_strict.notEqual)
    })

    it("notEqual", () => {
        assert.doesNotThrow(() => TAL_strict.notEqual(1, 2))
        assert.throws(() => TAL_strict.notEqual(1, 1), /expected not 1/)
    })

    // node's `assert` (as opposed to `assert.strict`) compares with ==,
    // NaN still equal to itself; the *StrictEqual names stay strict there.
    it("assert compares loosely in equal / notEqual, strictly in strictEqual", () => {
        assert.doesNotThrow(() => TAL_assert.equal(1, "1"))
        assert.doesNotThrow(() => TAL_assert.equal(0, -0))
        assert.doesNotThrow(() => TAL_assert.equal(null, undefined))
        assert.doesNotThrow(() => TAL_assert.equal(NaN, NaN))
        assert.throws(() => TAL_assert.equal(1, "2"), /expected "2", got 1/)
        assert.throws(() => TAL_assert.notEqual(1, "1"), /expected not "1"/)
        assert.doesNotThrow(() => TAL_assert.notEqual(1, 2))

        assert.throws(() => TAL_assert.strictEqual(1, "1"))
        assert.doesNotThrow(() => TAL_assert.notStrictEqual(1, "1"))
        assert.equal(TAL_assert.strictEqual, TAL_strict.equal)
        assert.equal(TAL_assert.deepStrictEqual, TAL_strict.deepEqual)
    })

    it("assert reaches the same loose deepEqual, and the strict one by its name", () => {
        assert.doesNotThrow(() => TAL_assert.deepEqual({a: 1}, {a: "1"}))
        assert.throws(() => TAL_assert.deepStrictEqual({a: 1}, {a: "1"}), /deep-equal/)
        assert.throws(() => TAL_assert.notDeepEqual({a: 1}, {a: "1"}), /expected not to deep-equal/)
    })

    // Both callables work as ok, and both lead to the strict one via .strict.
    it("assert is callable like strict, and .strict leads to strict from either", () => {
        assert.doesNotThrow(() => TAL_assert(1))
        assert.throws(() => TAL_assert(0), /expected truthy/)
        assert.equal(typeof TAL_strict, "function")
        assert.equal(TAL_strict.strict, TAL_strict)
        assert.notEqual(TAL_assert, TAL_strict)
    })

    // Everything that has no loose counterpart is the very same function.
    it("assert and strict share fail / throws / rejects / match / ok / ifError", () => {
        assert.equal(TAL_assert.fail, TAL_strict.fail)
        assert.equal(TAL_assert.throws, TAL_strict.throws)
        assert.equal(TAL_assert.doesNotThrow, TAL_strict.doesNotThrow)
        assert.equal(TAL_assert.rejects, TAL_strict.rejects)
        assert.equal(TAL_assert.doesNotReject, TAL_strict.doesNotReject)
        assert.equal(TAL_assert.match, TAL_strict.match)
        assert.equal(TAL_assert.doesNotMatch, TAL_strict.doesNotMatch)
        assert.equal(TAL_assert.ok, TAL_strict.ok)
        assert.equal(TAL_assert.ifError, TAL_strict.ifError)
    })

    it("the loose failures name the loose operators", () => {
        const operator = (fn: () => void): string | undefined => (catchError(fn) as {operator?: string} | undefined)?.operator
        assert.equal(operator(() => TAL_assert.equal(1, 2)), "equal")
        assert.equal(operator(() => TAL_assert.notEqual(1, 1)), "notEqual")
        assert.equal(operator(() => TAL_strict.equal(1, 2)), "strictEqual")
        assert.equal(operator(() => TAL_strict.notEqual(1, 1)), "notStrictEqual")
    })
    it("match and doesNotMatch", () => {
        assert.doesNotThrow(() => TAL_strict.match("abc", /b/))
        assert.throws(() => TAL_strict.match("abc", /z/), /did not match/)
        assert.doesNotThrow(() => TAL_strict.doesNotMatch("abc", /z/))
        assert.throws(() => TAL_strict.doesNotMatch("abc", /b/), /matched/)
    })

    it("ifError", () => {
        assert.doesNotThrow(() => TAL_strict.ifError(null))
        assert.doesNotThrow(() => TAL_strict.ifError(undefined))
        assert.throws(() => TAL_strict.ifError(new Error("x")), /unwanted exception: x$/)
        assert.throws(() => TAL_strict.ifError(new TypeError()), /unwanted exception: TypeError$/)
        assert.throws(() => TAL_strict.ifError("str"), /unwanted exception: "str"$/)
    })

    it("fail", () => {
        assert.throws(() => TAL_strict.fail(), /Failed/)
        assert.throws(() => TAL_strict.fail("why"), /why/)
    })

    // The message alone does not say which value arrived.
    it("equal keeps the values alongside a custom message", () => {
        const error = catchError(() => TAL_strict.equal(1, 2, "blah"))

        assert.match(String(error?.message), /^blah\n\nexpected 2, got 1$/)
        assert.equal(catchError(() => TAL_strict.notEqual(5, 5, "blah"))?.message, "blah")
    })

    it("an Error passed as message is thrown as is", () => {
        const sentinel = new Error("sentinel")
        assert.equal(catchError(() => TAL_strict.ok(false, sentinel)), sentinel)
    })

    it("an Error from another realm is thrown as is", () => {
        const sentinel = foreignError("from another realm")

        assert.ok(catchError(() => TAL_strict.ok(false, sentinel)) === sentinel, "ok wrapped it")
        assert.ok(catchError(() => TAL_strict.equal(1, 2, sentinel)) === sentinel, "equal wrapped it")
        assert.ok(catchError(() => TAL_strict.match("a", /b/, sentinel)) === sentinel, "match wrapped it")
        assert.ok(catchError(() => TAL_strict.fail(sentinel)) === sentinel, "fail wrapped it")
    })

    // A plain object shaped like an Error stays a message.
    it("an object that only looks like an Error is not one", () => {
        const error = catchError(() => TAL_strict.ok(false, {name: "Error", message: "x"} as never))

        assert.equal(error?.name, "AssertionError")
    })

    it("AssertionError carries actual and expected", () => {
        const error = catchError(() => TAL_strict.equal("got", "want")) as Error & {
            code?: string, actual?: unknown, expected?: unknown, operator?: string,
        }
        assert.equal(error?.name, "AssertionError")
        assert.equal(error?.code, "ERR_ASSERTION")
        assert.equal(error?.actual, "got")
        assert.equal(error?.expected, "want")
        assert.equal(error?.operator, "strictEqual")
    })
})
