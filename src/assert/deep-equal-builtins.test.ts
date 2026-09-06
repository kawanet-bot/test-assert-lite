import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {strict as TAL} from "./../index.ts"

const TITLE = "assert/deep-equal-builtins.test.ts"

const catchError = (fn: () => unknown): Error | undefined => {
    try {
        fn()
        return undefined
    } catch (e) {
        return e as Error
    }
}

describe(TITLE, () => {
    // name/message are not enumerable, so without special handling two
    // errors with different messages would look equal; stack is left out,
    // matching node's own deepStrictEqual.
    it("compares Errors by name and message, not by stack", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Error("boom"), new Error("boom")))
        assert.throws(() => TAL.deepEqual(new Error("boom"), new Error("bang")), /deep-equal/)

        const renamed = new Error("boom")
        renamed.name = "Custom"
        assert.throws(() => TAL.deepEqual(renamed, new Error("boom")), /deep-equal/)
    })

    it("still compares an Error's own extra enumerable properties", () => {
        const withCode = (code: string): Error => Object.assign(new Error("boom"), {code})
        assert.doesNotThrow(() => TAL.deepEqual(withCode("E1"), withCode("E1")))
        assert.throws(() => TAL.deepEqual(withCode("E1"), withCode("E2")), /deep-equal/)
    })

    // cause is not enumerable either, and is common enough (ES2022 exception
    // chaining) to get the same explicit treatment as name/message.
    it("compares an Error's cause recursively", () => {
        assert.doesNotThrow(() => TAL.deepEqual(
            new Error("boom", {cause: new Error("inner")}),
            new Error("boom", {cause: new Error("inner")}),
        ))
        assert.throws(() => TAL.deepEqual(
            new Error("boom", {cause: new Error("inner")}),
            new Error("boom", {cause: new Error("other")}),
        ), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Error("boom", {cause: "x"}), new Error("boom")), /deep-equal/)
    })

    // cause is recursed into before the memo stamp used to be set, so a
    // self- or mutually-referencing cause chain overflowed the stack instead
    // of resolving like any other cycle.
    it("breaks a cycle reached through cause the same way as through a plain key", () => {
        const a = new Error("x") as Error & {cause?: unknown}
        a.cause = a
        const b = new Error("x") as Error & {cause?: unknown}
        b.cause = b
        assert.doesNotThrow(() => TAL.deepEqual(a, b))
    })

    it("compares an AggregateError's own errors array", () => {
        const one = (): AggregateError => new AggregateError([new Error("a")], "many")
        assert.doesNotThrow(() => TAL.deepEqual(one(), one()))
        assert.throws(() => TAL.deepEqual(one(), new AggregateError([new Error("b")], "many")), /deep-equal/)
    })

    // errors is checked by name wherever it appears, not only when the
    // instance is actually an AggregateError.
    it("compares a plain Error's own errors property the same way", () => {
        const withErrors = (errors: unknown[]): Error => Object.assign(new Error("x"), {errors})
        assert.doesNotThrow(() => TAL.deepEqual(withErrors([1]), withErrors([1])))
        assert.throws(() => TAL.deepEqual(withErrors([1]), withErrors([2])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(withErrors([1]), new Error("x")), /deep-equal/)
    })

    // Reading a[key] to compare naturally invokes a getter; nothing extra
    // is needed for this beyond the plain own-key walk.
    it("invokes getters and compares their returned value", () => {
        let calls = 0
        const withGetter = (): object => ({
            get a() {
                calls++
                return 1
            },
        })
        assert.doesNotThrow(() => TAL.deepEqual(withGetter(), withGetter()))
        assert.equal(calls, 2)
    })

    // Own enumerable Symbol-keyed properties are cheap to fold into the same
    // walk as Object.keys(), so they are compared the same way, matching
    // node's deepStrictEqual (a change from an earlier, deliberately
    // narrower pass - see the tracking issue for the history).
    it("compares own enumerable symbol-keyed properties", () => {
        const sym = Symbol("k")
        assert.doesNotThrow(() => TAL.deepEqual({a: 1, [sym]: "x"}, {a: 1, [sym]: "x"}))
        assert.throws(() => TAL.deepEqual({a: 1, [sym]: "x"}, {a: 1, [sym]: "y"}), /deep-equal/)
        assert.throws(() => TAL.deepEqual({a: 1, [sym]: "x"}, {a: 1}), /deep-equal/)
        // A non-enumerable symbol-keyed property is not part of the contract
        // either, same as a non-enumerable string-keyed one.
        const withHidden = Object.defineProperty({}, sym, {value: "x", enumerable: false})
        assert.doesNotThrow(() => TAL.deepEqual(withHidden, {}))
    })

    // Date/RegExp keep their real state outside of own enumerable properties,
    // so they get an explicit value-based comparison, then fall through to
    // the own-key walk the same way Error/URL do above.
    it("compares Date by time value and RegExp by source/flags", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Date(0), new Date(0)))
        assert.throws(() => TAL.deepEqual(new Date(0), new Date(1)), /deep-equal/)
        // getTime() is NaN for both, and NaN !== NaN, so this needs Object.is.
        assert.doesNotThrow(() => TAL.deepEqual(new Date(NaN), new Date(NaN)))
        assert.throws(() => TAL.deepEqual(new Date(NaN), new Date(0)), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual(/a/gi, /a/gi))
        assert.throws(() => TAL.deepEqual(/a/g, /b/g), /deep-equal/)
        assert.throws(() => TAL.deepEqual(/a/g, /a/i), /deep-equal/)
    })

    // getTime()/valueOf() are called through the prototype, so an own
    // property of the same name on the instance cannot fool the comparison.
    it("resists an own getTime overriding the real one", () => {
        const a = new Date(0)
        Object.defineProperty(a, "getTime", {value: () => 999})
        assert.doesNotThrow(() => TAL.deepEqual(a, new Date(0)))
    })

    it("still compares a Date's own extra enumerable properties", () => {
        const withExtra = (t: number, x: number): Date => Object.assign(new Date(t), {x})
        assert.doesNotThrow(() => TAL.deepEqual(withExtra(0, 1), withExtra(0, 1)))
        assert.throws(() => TAL.deepEqual(withExtra(0, 1), withExtra(0, 2)), /deep-equal/)
    })

    // lastIndex is own but non-enumerable, so it needs the same explicit
    // treatment as Date's getTime, matching node since RegExp gained this
    // comparison in v18.0.0 (within this library's supported range).
    it("compares a RegExp's lastIndex, plus any extra own enumerable property", () => {
        const a = /a/g
        a.exec("aaa")
        const b = /a/g
        assert.throws(() => TAL.deepEqual(a, b), /deep-equal/)
        b.exec("aaa")
        assert.doesNotThrow(() => TAL.deepEqual(a, b))

        const withExtra = Object.assign(/a/g, {x: 1})
        assert.throws(() => TAL.deepEqual(withExtra, /a/g), /deep-equal/)
    })

    // Boolean/Number wrap a primitive that no own key exposes; String's
    // characters already are own enumerable indices, so it only gains the
    // "extra own property" check the other two get for free from the walk.
    it("compares boxed Boolean/Number/String/BigInt by their wrapped value", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Boolean(true), new Boolean(true)))
        assert.throws(() => TAL.deepEqual(new Boolean(true), new Boolean(false)), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Number(1), new Number(2)), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual(new String("x"), new String("x")))
        assert.doesNotThrow(() => TAL.deepEqual(Object(1n), Object(1n)))
        assert.throws(() => TAL.deepEqual(Object(1n), Object(2n)), /deep-equal/)

        const extra = new String("x") as String & {slow?: boolean}
        extra.slow = true
        assert.throws(() => TAL.deepEqual(extra, new String("x")), /deep-equal/)
    })

    // Unlike the opaque types in deep-equal-collections.test.ts, node's real
    // deepStrictEqual special cases URL by comparing href - matched here
    // since it costs little and a URL can plausibly appear in ordinary
    // form-handling code.
    it("compares URL by href, plus any extra own property", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new URL("http://foo"), new URL("http://foo")))
        assert.throws(() => TAL.deepEqual(new URL("http://foo"), new URL("http://bar")), /deep-equal/)

        const withExtra = new URL("http://foo") as URL & {tag?: number}
        withExtra.tag = 1
        assert.throws(() => TAL.deepEqual(withExtra, new URL("http://foo")), /deep-equal/)
    })

    // Node's own URL exposes engine-internal state through enumerable own
    // symbols on some versions (observed on 18.x, gone by 24.x) - a builtin
    // like this must not have those leak into the comparison the way a
    // plain object's own symbol keys legitimately do above.
    it("ignores symbol-keyed properties on a builtin like URL", () => {
        const a = new URL("http://foo")
        Object.defineProperty(a, Symbol("internal"), {value: 1, enumerable: true})
        assert.doesNotThrow(() => TAL.deepEqual(a, new URL("http://foo")))
    })

    // A null-prototype object cannot be rendered with String(); building the
    // failure message must fall back instead of crashing the assertion itself.
    it("does not crash building the message for a null-prototype object", () => {
        const a = Object.create(null)
        a.x = 1
        const b = Object.create(null)
        b.x = 2
        assert.equal(catchError(() => TAL.deepEqual(a, b))?.name, "AssertionError")
    })
})
