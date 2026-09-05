import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import * as TAL from "./index.ts"

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
        assert.doesNotThrow(() => TAL.strict(1))
        assert.throws(() => TAL.strict(0), /expected truthy/)
    })

    it("ok", () => {
        assert.doesNotThrow(() => TAL.strict.ok("x"))
        assert.throws(() => TAL.strict.ok(""), /expected truthy/)
        assert.throws(() => TAL.strict.ok(false, "custom"), /custom/)
    })

    it("equal uses Object.is semantics", () => {
        assert.doesNotThrow(() => TAL.strict.equal(NaN, NaN))
        assert.throws(() => TAL.strict.equal(0, -0))
        assert.throws(() => TAL.strict.equal("a", "b"), /expected "b", got "a"/)
    })

    it("strictEqual is an alias of equal", () => {
        assert.equal(TAL.strict.strictEqual, TAL.strict.equal)
        assert.equal(TAL.strict.notStrictEqual, TAL.strict.notEqual)
    })

    it("notEqual", () => {
        assert.doesNotThrow(() => TAL.strict.notEqual(1, 2))
        assert.throws(() => TAL.strict.notEqual(1, 1), /expected not 1/)
    })
    it("match and doesNotMatch", () => {
        assert.doesNotThrow(() => TAL.strict.match("abc", /b/))
        assert.throws(() => TAL.strict.match("abc", /z/), /did not match/)
        assert.doesNotThrow(() => TAL.strict.doesNotMatch("abc", /z/))
        assert.throws(() => TAL.strict.doesNotMatch("abc", /b/), /matched/)
    })

    it("ifError", () => {
        assert.doesNotThrow(() => TAL.strict.ifError(null))
        assert.doesNotThrow(() => TAL.strict.ifError(undefined))
        assert.throws(() => TAL.strict.ifError(new Error("x")), /unwanted exception/)
    })

    it("fail", () => {
        assert.throws(() => TAL.strict.fail(), /Failed/)
        assert.throws(() => TAL.strict.fail("why"), /why/)
    })

    // The message alone does not say which value arrived.
    it("equal keeps the values alongside a custom message", () => {
        const error = catchError(() => TAL.strict.equal(1, 2, "blah"))

        assert.match(String(error?.message), /^blah\n\nexpected 2, got 1$/)
        assert.equal(catchError(() => TAL.strict.notEqual(5, 5, "blah"))?.message, "blah")
    })

    it("an Error passed as message is thrown as is", () => {
        const sentinel = new Error("sentinel")
        assert.equal(catchError(() => TAL.strict.ok(false, sentinel)), sentinel)
    })

    it("an Error from another realm is thrown as is", () => {
        const sentinel = foreignError("from another realm")

        assert.ok(catchError(() => TAL.strict.ok(false, sentinel)) === sentinel, "ok wrapped it")
        assert.ok(catchError(() => TAL.strict.equal(1, 2, sentinel)) === sentinel, "equal wrapped it")
        assert.ok(catchError(() => TAL.strict.match("a", /b/, sentinel)) === sentinel, "match wrapped it")
        assert.ok(catchError(() => TAL.strict.fail(sentinel)) === sentinel, "fail wrapped it")
    })

    // A plain object shaped like an Error stays a message.
    it("an object that only looks like an Error is not one", () => {
        const error = catchError(() => TAL.strict.ok(false, {name: "Error", message: "x"} as never))

        assert.equal(error?.name, "AssertionError")
    })

    it("AssertionError carries actual and expected", () => {
        const error = catchError(() => TAL.strict.equal("got", "want")) as Error & {
            code?: string, actual?: unknown, expected?: unknown, operator?: string,
        }
        assert.equal(error?.name, "AssertionError")
        assert.equal(error?.code, "ERR_ASSERTION")
        assert.equal(error?.actual, "got")
        assert.equal(error?.expected, "want")
        assert.equal(error?.operator, "strictEqual")
    })
})
