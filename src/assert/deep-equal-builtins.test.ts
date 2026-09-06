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

    // Out of scope for this pass: unlike node's deepStrictEqual, symbol-keyed
    // own enumerable properties are not part of the family's actual usage.
    it("does not compare symbol-keyed properties (documented scope limit)", () => {
        const sym = Symbol("k")
        assert.doesNotThrow(() => TAL.deepEqual({a: 1, [sym]: "x"}, {a: 1, [sym]: "y"}))
    })

    // Date/RegExp keep their real state outside of own enumerable properties,
    // so they get an explicit value-based comparison instead of the own-key walk.
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

    // getTime() is called through the prototype, so an own property of the
    // same name on the instance cannot fool the comparison.
    it("resists an own getTime overriding the real one", () => {
        const a = new Date(0)
        Object.defineProperty(a, "getTime", {value: () => 999})
        assert.doesNotThrow(() => TAL.deepEqual(a, new Date(0)))
    })

    // Boolean/Number wrap a primitive that no own key exposes; String's
    // characters already are own enumerable indices, so it only gains the
    // "extra own property" check the other two get for free from the walk.
    it("compares boxed Boolean/Number/String by their wrapped value", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Boolean(true), new Boolean(true)))
        assert.throws(() => TAL.deepEqual(new Boolean(true), new Boolean(false)), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Number(1), new Number(2)), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual(new String("x"), new String("x")))

        const extra = new String("x") as String & {slow?: boolean}
        extra.slow = true
        assert.throws(() => TAL.deepEqual(extra, new String("x")), /deep-equal/)
    })

    // Not specially handled, but the tag check plus the length check above
    // make this work anyway: a typed array's elements are own enumerable
    // indices, same as a plain array's.
    it("compares typed arrays element by element", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])))
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]), new Int8Array([1, 2])), /deep-equal/)
    })

    // Map/Set/WeakMap/WeakSet/ArrayBuffer/DataView/Promise keep their real
    // content outside of own enumerable properties, so only a shared
    // reference is treated as equal for them (documented scope limit; see
    // the plan comment on the tracking issue for the tradeoff).
    it("only treats Map/Set/WeakMap/WeakSet/ArrayBuffer/DataView/Promise as equal by reference", () => {
        assert.doesNotThrow(() => {
            const shared = new Map([["a", 1]])
            TAL.deepEqual(shared, shared)
        })
        assert.throws(() => TAL.deepEqual(new Map([["a", 1]]), new Map([["a", 1]])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Set([1]), new Set([1])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new ArrayBuffer(4), new ArrayBuffer(4)), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new DataView(new ArrayBuffer(4)), new DataView(new ArrayBuffer(4))), /deep-equal/)
        assert.throws(() => TAL.deepEqual(Promise.resolve(1), Promise.resolve(1)), /deep-equal/)
    })

    // Unlike the opaque types above, node's real deepStrictEqual special
    // cases URL by comparing href - matched here since it costs little and a
    // URL can plausibly appear in ordinary form-handling code.
    it("compares URL by href, plus any extra own property", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new URL("http://foo"), new URL("http://foo")))
        assert.throws(() => TAL.deepEqual(new URL("http://foo"), new URL("http://bar")), /deep-equal/)

        const withExtra = new URL("http://foo") as URL & {tag?: number}
        withExtra.tag = 1
        assert.throws(() => TAL.deepEqual(withExtra, new URL("http://foo")), /deep-equal/)
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
