import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {strict as TAL} from "./index.ts"

const TITLE = "assert.test.ts"

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
        assert.doesNotThrow(() => TAL(1))
        assert.throws(() => TAL(0), /expected truthy/)
    })

    it("ok", () => {
        assert.doesNotThrow(() => TAL.ok("x"))
        assert.throws(() => TAL.ok(""), /expected truthy/)
        assert.throws(() => TAL.ok(false, "custom"), /custom/)
    })

    it("equal uses Object.is semantics", () => {
        assert.doesNotThrow(() => TAL.equal(NaN, NaN))
        assert.throws(() => TAL.equal(0, -0))
        assert.throws(() => TAL.equal("a", "b"), /expected "b", got "a"/)
    })

    it("strictEqual is an alias of equal", () => {
        assert.equal(TAL.strictEqual, TAL.equal)
        assert.equal(TAL.notStrictEqual, TAL.notEqual)
    })

    it("notEqual", () => {
        assert.doesNotThrow(() => TAL.notEqual(1, 2))
        assert.throws(() => TAL.notEqual(1, 1), /expected not 1/)
    })
    it("match and doesNotMatch", () => {
        assert.doesNotThrow(() => TAL.match("abc", /b/))
        assert.throws(() => TAL.match("abc", /z/), /did not match/)
        assert.doesNotThrow(() => TAL.doesNotMatch("abc", /z/))
        assert.throws(() => TAL.doesNotMatch("abc", /b/), /matched/)
    })

    it("ifError", () => {
        assert.doesNotThrow(() => TAL.ifError(null))
        assert.doesNotThrow(() => TAL.ifError(undefined))
        assert.throws(() => TAL.ifError(new Error("x")), /unwanted exception/)
    })

    it("fail", () => {
        assert.throws(() => TAL.fail(), /Failed/)
        assert.throws(() => TAL.fail("why"), /why/)
    })

    // The message alone does not say which value arrived.
    it("equal keeps the values alongside a custom message", () => {
        const error = catchError(() => TAL.equal(1, 2, "blah"))

        assert.match(String(error?.message), /^blah\n\nexpected 2, got 1$/)
        assert.equal(catchError(() => TAL.notEqual(5, 5, "blah"))?.message, "blah")
    })

    it("an Error passed as message is thrown as is", () => {
        const sentinel = new Error("sentinel")
        assert.equal(catchError(() => TAL.ok(false, sentinel)), sentinel)
    })

    it("an Error from another realm is thrown as is", () => {
        const sentinel = foreignError("from another realm")

        assert.ok(catchError(() => TAL.ok(false, sentinel)) === sentinel, "ok wrapped it")
        assert.ok(catchError(() => TAL.equal(1, 2, sentinel)) === sentinel, "equal wrapped it")
        assert.ok(catchError(() => TAL.match("a", /b/, sentinel)) === sentinel, "match wrapped it")
        assert.ok(catchError(() => TAL.fail(sentinel)) === sentinel, "fail wrapped it")
    })

    // A plain object shaped like an Error stays a message.
    it("an object that only looks like an Error is not one", () => {
        const error = catchError(() => TAL.ok(false, {name: "Error", message: "x"} as never))

        assert.equal(error?.name, "AssertionError")
    })

    it("AssertionError carries actual and expected", () => {
        const error = catchError(() => TAL.equal("got", "want")) as Error & {
            code?: string, actual?: unknown, expected?: unknown, operator?: string,
        }
        assert.equal(error?.name, "AssertionError")
        assert.equal(error?.code, "ERR_ASSERTION")
        assert.equal(error?.actual, "got")
        assert.equal(error?.expected, "want")
        assert.equal(error?.operator, "strictEqual")
    })
})
