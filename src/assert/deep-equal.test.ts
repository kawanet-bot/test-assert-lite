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
    // node:assert/strict exports deepStrictEqual/notDeepStrictEqual as the
    // exact same function objects as deepEqual/notDeepEqual (confirmed via
    // ===), the same way it does for equal/strictEqual; matched here for a
    // caller that reaches for the more explicit name.
    it("deepStrictEqual/notDeepStrictEqual are aliases of deepEqual/notDeepEqual", () => {
        assert.equal(TAL.deepStrictEqual, TAL.deepEqual)
        assert.equal(TAL.notDeepStrictEqual, TAL.notDeepEqual)
    })

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
        // A non-enumerable property of the same name must not count as a match.
        const b = Object.defineProperty({}, "a", {value: 1, enumerable: false})
        assert.throws(() => TAL.deepEqual({a: 1}, b), /deep-equal/)
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

    // A shared [[Prototype]] is not the whole story: an Arguments object or a
    // fake array-like can be made to share one with a plain object or a real
    // array. The internal tag (via Object.prototype.toString) catches what
    // the prototype check alone misses.
    it("requires the same exotic kind, not just a matching prototype", () => {
        const args = (function (_n: number) {
            return arguments
        })(1)
        assert.throws(() => TAL.deepEqual({0: 1}, args), /deep-equal/)

        const fakeArray: unknown[] = Object.create(Array.prototype)
        fakeArray[0] = 1
        Object.defineProperty(fakeArray, "length", {value: 1, enumerable: false})
        assert.throws(() => TAL.deepEqual(fakeArray, [1]), /deep-equal/)
    })

    // .length is not enumerable, so a manually stretched array needs its
    // own check alongside the own-key comparison.
    it("checks array length even when no extra index became enumerable", () => {
        const stretched = [1, 2]
        stretched.length = 5
        assert.throws(() => TAL.deepEqual(stretched, [1, 2]), /deep-equal/)
    })

    // The length check above must stay scoped to arrays/typed arrays: a
    // plain class with its own inherited `length` accessor is not one, and
    // reading it as if it were would invoke the getter as a side effect.
    it("does not mistake a plain object's own length property for an array's", () => {
        let calls = 0
        class Sized {
            id = 1
            get length(): number {
                calls++
                return 9
            }
        }
        assert.doesNotThrow(() => TAL.deepEqual(new Sized(), new Sized()))
        assert.equal(calls, 0)
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
