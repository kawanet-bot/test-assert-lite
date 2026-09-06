import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {strict as TAL} from "./../index.ts"

const TITLE = "assert/deep-equal.test.ts"

const catchError = (fn: () => unknown): Error | undefined => {
    try {
        fn()
        return undefined
    } catch (e) {
        return e as Error
    }
}

describe(TITLE, () => {
    it("compares primitives with Object.is semantics, like equal", () => {
        assert.doesNotThrow(() => TAL.deepEqual(NaN, NaN))
        assert.throws(() => TAL.deepEqual(0, -0), /deep-equal/)
        assert.throws(() => TAL.deepEqual(null, undefined), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual("x", "x"))
    })

    it("compares arrays element by element", () => {
        assert.doesNotThrow(() => TAL.deepEqual([1, "a", true], [1, "a", true]))
        assert.throws(() => TAL.deepEqual([1, 2], [1, 2, 3]), /deep-equal/)
        assert.throws(() => TAL.deepEqual([1, 2], [2, 1]), /deep-equal/)
    })

    // The shape most of the family actually uses: an array of plain objects
    // holding only strings, as produced by e.g. field.current().map(...).
    it("compares arrays of plain objects, the family's real usage shape", () => {
        assert.doesNotThrow(() => TAL.deepEqual(
            [{name: "TX", value: "BAR"}],
            [{name: "TX", value: "BAR"}],
        ))
        assert.throws(() => TAL.deepEqual(
            [{name: "TX", value: "BAR"}],
            [{name: "TX", value: "BAZ"}],
        ), /deep-equal/)
    })

    it("compares nested objects recursively", () => {
        assert.doesNotThrow(() => TAL.deepEqual({a: {b: [1, 2]}}, {a: {b: [1, 2]}}))
        assert.throws(() => TAL.deepEqual({a: {b: [1, 2]}}, {a: {b: [1, 3]}}), /deep-equal/)
    })

    it("requires the same own enumerable keys, not merely the same count", () => {
        assert.throws(() => TAL.deepEqual({a: 1, b: 2}, {a: 1, c: 2}), /deep-equal/)
        // A key explicitly set to undefined is still present and must match.
        assert.throws(() => TAL.deepEqual({a: 1, b: undefined}, {a: 1}), /deep-equal/)
    })

    // deepStrictEqual, which this follows, rejects a shape match across
    // different classes; a plain equal deepEqual would accept it.
    it("requires the same prototype", () => {
        class Foo {
            a = 1
        }
        assert.throws(() => TAL.deepEqual(new Foo(), {a: 1}), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual(new Foo(), new Foo()))
    })

    // .length is not enumerable, so a manually stretched array needs its
    // own check alongside the own-key comparison.
    it("checks array length even when no extra index became enumerable", () => {
        const stretched = [1, 2]
        stretched.length = 5
        assert.throws(() => TAL.deepEqual(stretched, [1, 2]), /deep-equal/)
    })

    it("breaks self-referencing cycles instead of overflowing the stack", () => {
        const a: Record<string, unknown> = {name: "x"}
        a.self = a
        const b: Record<string, unknown> = {name: "x"}
        b.self = b
        assert.doesNotThrow(() => TAL.deepEqual(a, b))

        const c: Record<string, unknown> = {name: "y"}
        c.self = c
        assert.throws(() => TAL.deepEqual(a, c), /deep-equal/)
    })

    it("breaks mutually-referencing cycles the same way", () => {
        const a1: Record<string, unknown> = {}
        const a2: Record<string, unknown> = {}
        a1.other = a2
        a2.other = a1
        const b1: Record<string, unknown> = {}
        const b2: Record<string, unknown> = {}
        b1.other = b2
        b2.other = b1
        assert.doesNotThrow(() => TAL.deepEqual(a1, b1))
    })

    // A same-shaped cycle of a different period is a real structural
    // difference, not something to paper over as "already seen, assume
    // equal" - that would silently pass two genuinely different graphs.
    it("tells apart a 1-cycle from a same-shaped 2-cycle instead of stack-overflowing", () => {
        const x1: Record<string, unknown> = {}
        x1.self = x1
        const y1: Record<string, unknown> = {}
        const y2: Record<string, unknown> = {}
        y1.self = y2
        y2.self = y1
        assert.throws(() => TAL.deepEqual(x1, y1), /deep-equal/)
    })

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

    // Map/Set/WeakMap/WeakSet/ArrayBuffer keep their real content outside of
    // own enumerable properties, so only a shared reference is treated as
    // equal for them (documented scope limit; see the plan comment on the
    // tracking issue for the tradeoff).
    it("only treats Map/Set/WeakMap/WeakSet/ArrayBuffer as equal by reference", () => {
        assert.doesNotThrow(() => {
            const shared = new Map([["a", 1]])
            TAL.deepEqual(shared, shared)
        })
        assert.throws(() => TAL.deepEqual(new Map([["a", 1]]), new Map([["a", 1]])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Set([1]), new Set([1])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new ArrayBuffer(4), new ArrayBuffer(4)), /deep-equal/)
    })

    it("notDeepEqual is the exact negation", () => {
        assert.doesNotThrow(() => TAL.notDeepEqual([1, 2], [1, 3]))
        assert.throws(() => TAL.notDeepEqual([1, 2], [1, 2]), /expected not to deep-equal/)
    })

    // The message alone does not say which value arrived, same rationale as equal().
    it("deepEqual keeps the values alongside a custom message", () => {
        const error = catchError(() => TAL.deepEqual([1], [2], "blah"))
        assert.match(String(error?.message), /^blah\n\nexpected \[2] to deep-equal \[1]$/)
        assert.equal(catchError(() => TAL.notDeepEqual([1], [1], "blah"))?.message, "blah")
    })

    it("an Error passed as message is thrown as is", () => {
        const sentinel = new Error("sentinel")
        assert.equal(catchError(() => TAL.deepEqual(1, 2, sentinel)), sentinel)
        assert.equal(catchError(() => TAL.notDeepEqual(1, 1, sentinel)), sentinel)
    })

    it("AssertionError carries actual, expected and the strict operator name", () => {
        const error = catchError(() => TAL.deepEqual({a: 1}, {a: 2})) as Error & {
            code?: string, actual?: unknown, expected?: unknown, operator?: string,
        }
        assert.equal(error?.name, "AssertionError")
        assert.equal(error?.code, "ERR_ASSERTION")
        assert.deepEqual(error?.actual, {a: 1})
        assert.deepEqual(error?.expected, {a: 2})
        assert.equal(error?.operator, "deepStrictEqual")
    })
})
