import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"

const TITLE = "assert/deep-equal-loose.test.ts"

// The loose pair is what `assert` hands out, the strict one `strict`.
const local = createTAL()
const loose = local.assert
const strict = local.strict

describe(TITLE, () => {
    it("compares primitives with ==, keeping NaN equal to itself", () => {
        assert.doesNotThrow(() => loose.deepEqual(4, "4"))
        assert.doesNotThrow(() => loose.deepEqual(true, 1))
        assert.doesNotThrow(() => loose.deepEqual(0, -0))
        assert.doesNotThrow(() => loose.deepEqual(null, undefined))
        assert.doesNotThrow(() => loose.deepEqual(NaN, NaN))
        assert.throws(() => loose.deepEqual(4, "5"), /deep-equal/)
        assert.throws(() => loose.deepEqual("", "0"), /deep-equal/)
        // The strict pair is untouched by the loose one existing.
        assert.throws(() => strict.deepEqual(4, "4"), /deep-equal/)
    })

    // == would coerce the wrapper to its value, but node's deepEqual keeps
    // an object apart from any primitive under both rules.
    it("never equates an object with a primitive", () => {
        assert.throws(() => loose.deepEqual(new Number(1), 1), /deep-equal/)
        assert.throws(() => loose.deepEqual("a", ["a"]), /deep-equal/)
        assert.throws(() => loose.deepEqual(null, {}), /deep-equal/)
    })

    it("applies == to nested values, not only at the top", () => {
        assert.doesNotThrow(() => loose.deepEqual({a: 4, b: [1]}, {a: "4", b: ["1"]}))
        assert.doesNotThrow(() => loose.deepEqual([null, undefined], [undefined, null]))
        assert.throws(() => loose.deepEqual({a: 4}, {a: 5}), /deep-equal/)
    })

    // Symbol keys are part of the strict contract only.
    it("ignores symbol-keyed properties", () => {
        const sym = Symbol("k")
        assert.doesNotThrow(() => loose.deepEqual({a: 1, [sym]: 1}, {a: 1, [sym]: 2}))
        assert.doesNotThrow(() => loose.deepEqual({a: 1, [sym]: 1}, {a: 1}))
        assert.throws(() => strict.deepEqual({a: 1, [sym]: 1}, {a: 1}), /deep-equal/)
    })

    it("ignores the prototype but not the kind", () => {
        class Foo {
            a = 1
        }
        assert.doesNotThrow(() => loose.deepEqual(new Foo(), {a: 1}))
        assert.doesNotThrow(() => loose.deepEqual(Object.create(null), {}))
        // Same keys, different internal kind: still apart.
        const args = (function (_n: number) {
            return arguments
        })(1)
        assert.throws(() => loose.deepEqual({0: 1}, args), /deep-equal/)
        assert.throws(() => loose.deepEqual(new String("1"), [1]), /deep-equal/)
    })

    // The same key set is still required; a hole is not an undefined.
    it("still requires the same own enumerable keys", () => {
        assert.throws(() => loose.deepEqual({a: 1}, {a: 1, b: undefined}), /deep-equal/)
        assert.throws(() => loose.deepEqual([1, , 3], [1, undefined, 3]), /deep-equal/)
        assert.throws(() => loose.deepEqual([1, 2], [1, 2, 3]), /deep-equal/)
    })

    // Error name/message, Date time and RegExp source/flags are compared
    // the same way under both rules.
    it("keeps the Error, Date and RegExp comparisons of the strict rules", () => {
        assert.throws(() => loose.deepEqual(new Error("a"), new Error("b")), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Error("a"), new TypeError("a")), /deep-equal/)
        assert.doesNotThrow(() => loose.deepEqual(new Date(0), new Date(0)))
        assert.throws(() => loose.deepEqual(new Date(0), new Date(1)), /deep-equal/)
        assert.throws(() => loose.deepEqual(/a/g, /a/i), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Number(1), new Number(2)), /deep-equal/)
    })

    // Set/Map first clear what has()/get() finds, then match the rest by
    // deep equality; under loose that rest is matched by == as well, so
    // nothing extra is needed for coerced keys or values.
    it("matches Set elements and Map entries loosely", () => {
        assert.doesNotThrow(() => loose.deepEqual(new Set(["1"]), new Set([1])))
        assert.doesNotThrow(() => loose.deepEqual(new Map<unknown, string>([["1", "a"]]), new Map<unknown, string>([[1, "a"]])))
        assert.doesNotThrow(() => loose.deepEqual(new Map<string, unknown>([["a", "1"]]), new Map<string, unknown>([["a", 1]])))
        assert.doesNotThrow(() => loose.deepEqual(
            new Map<unknown, string>([[1, "a"], ["1", "b"]]),
            new Map<unknown, string>([["1", "a"], [true, "b"]]),
        ))
        assert.throws(() => loose.deepEqual(new Set([3, "3"]), new Set([3, 4])), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Map<string, unknown>([["a", "1"]]), new Map<string, unknown>([["a", 2]])), /deep-equal/)
        assert.throws(() => strict.deepEqual(new Set(["1"]), new Set([1])), /deep-equal/)
    })

    // Bytes are the strict rule's business; loose goes by element value,
    // and the prototype no longer separates a plain typed array from a
    // subclass instance of the same kind.
    it("compares typed arrays by element value", () => {
        assert.doesNotThrow(() => loose.deepEqual(new Float32Array([0]), new Float32Array([-0])))
        assert.doesNotThrow(() => loose.deepEqual(new Float64Array([NaN]), new Float64Array([NaN])))
        assert.throws(() => strict.deepEqual(new Float32Array([0]), new Float32Array([-0])), /deep-equal/)

        class Sub extends Uint8Array {}
        assert.doesNotThrow(() => loose.deepEqual(new Uint8Array([1, 2]), new Sub([1, 2])))
        assert.throws(() => loose.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), /deep-equal/)
        // A different element kind is still a different kind.
        assert.throws(() => loose.deepEqual(new Int16Array([1]), new Uint16Array([1])), /deep-equal/)
    })

    it("breaks cycles the same way as the strict rules", () => {
        const a: Record<string, unknown> = {n: 1}
        a.self = a
        const b: Record<string, unknown> = {n: "1"}
        b.self = b
        assert.doesNotThrow(() => loose.deepEqual(a, b))
        const c: Record<string, unknown> = {n: 1}
        c.self = {n: 1, self: c}
        assert.throws(() => loose.deepEqual(a, c), /deep-equal/)
    })

    it("notDeepEqual is the exact negation, and both name the loose operator", () => {
        assert.doesNotThrow(() => loose.notDeepEqual(1, 2))
        assert.throws(() => loose.notDeepEqual(1, "1"), /expected not to deep-equal/)

        const failed = (fn: () => void): {operator?: string} => {
            try {
                fn()
            } catch (e) {
                return e as {operator?: string}
            }
            return {}
        }
        assert.equal(failed(() => loose.deepEqual(1, 2)).operator, "deepEqual")
        assert.equal(failed(() => loose.notDeepEqual(1, 1)).operator, "notDeepEqual")
        assert.equal(failed(() => strict.deepEqual(1, 2)).operator, "deepStrictEqual")
    })

    // With the prototype out of the picture, a builtin from another realm
    // (an iframe, a vm context) must still be recognised as its kind on
    // either side, or the result would depend on the argument order.
    // Simulated by giving the instance a copy of its prototype that sits
    // outside the local chain - which is what a foreign realm's instance
    // looks like from here: `instanceof` says no, the slot is real.
    it("recognises builtins from another realm on either side", () => {
        const foreignProto = new Map<object, object>()
        const foreign = <T extends object>(value: T): T => {
            const proto = Object.getPrototypeOf(value) as object
            if (!foreignProto.has(proto)) foreignProto.set(proto, Object.create(Object.prototype, Object.getOwnPropertyDescriptors(proto)) as object)
            return Object.setPrototypeOf(value, foreignProto.get(proto)!)
        }
        const pairs: [string, () => object, () => object][] = [
            ["Date", () => foreign(new Date(0)), () => new Date(0)],
            ["RegExp", () => foreign(/a/g), () => /a/g],
            ["Number", () => foreign(new Number(1)), () => new Number(1)],
            ["String", () => foreign(new String("x")), () => new String("x")],
            ["Map", () => foreign(new Map([[1, 2]])), () => new Map([[1, 2]])],
            ["Set", () => foreign(new Set([1])), () => new Set([1])],
            ["ArrayBuffer", () => foreign(new Uint8Array([1]).buffer), () => new Uint8Array([1]).buffer],
            ["URL", () => foreign(new URL("http://x")), () => new URL("http://x")],
        ]
        for (const [kind, far, near] of pairs) {
            assert.equal(far() instanceof near().constructor, false, kind)
            assert.doesNotThrow(() => loose.deepEqual(far(), near()), kind)
            assert.doesNotThrow(() => loose.deepEqual(near(), far()), kind)
        }
        // The values are still compared, in either order.
        assert.throws(() => loose.deepEqual(foreign(new Date(0)), new Date(1)), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Date(1), foreign(new Date(0))), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Map([[1, 2]]), foreign(new Map([[1, 3]]))), /deep-equal/)
        // Strict still holds the prototype against it.
        assert.throws(() => strict.deepEqual(foreign(new Date(0)), new Date(0)), /deep-equal/)
    })

    // The tag alone can be claimed by any object; without the internal
    // slot behind it the two are simply different, in either order, and
    // the failure is an ordinary one rather than the intrinsic's TypeError.
    it("treats a tag without the slot behind it as a difference, not a TypeError", () => {
        const claim = (tag: string): object => Object.defineProperty({}, Symbol.toStringTag, {value: tag})
        assert.throws(() => loose.deepEqual(claim("Date"), new Date(0)), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Date(0), claim("Date")), /deep-equal/)
        assert.throws(() => loose.deepEqual(claim("Map"), new Map()), /deep-equal/)
        assert.throws(() => loose.deepEqual(new Set(), claim("Set")), /deep-equal/)
        assert.throws(() => loose.deepEqual(claim("RegExp"), /a/), /deep-equal/)
        // Two claims with nothing behind them are not equal either.
        assert.throws(() => loose.deepEqual(claim("Date"), claim("Date")), /deep-equal/)
    })

    // A claimed SharedArrayBuffer tag used to reach the byte comparison,
    // where `new Uint8Array(claim)` reads an empty view and matches an
    // empty real buffer. Skipped where the global is absent (a browser
    // that is not cross-origin isolated), same as the strict-side test.
    it("refuses a SharedArrayBuffer tag without the slot behind it", {skip: "undefined" === typeof SharedArrayBuffer}, () => {
        const claim = Object.defineProperty({}, Symbol.toStringTag, {value: "SharedArrayBuffer"})
        assert.throws(() => loose.deepEqual(claim, new SharedArrayBuffer(0)), /deep-equal/)
        assert.throws(() => loose.deepEqual(new SharedArrayBuffer(0), claim), /deep-equal/)
        assert.doesNotThrow(() => loose.deepEqual(new SharedArrayBuffer(0), new SharedArrayBuffer(0)))
    })

    // Without the prototype check, a builtin whose own tag reads "Object"
    // would be the easiest thing to mistake for a plain object; the kind
    // is found through instanceof and the slot, not the tag, so it is not.
    it("still compares a builtin by its value when its tag is masked as Object", () => {
        const masked = <T extends object>(v: T): T => Object.defineProperty(v, Symbol.toStringTag, {value: "Object"})
        assert.doesNotThrow(() => loose.deepEqual(masked(new Date(0)), masked(new Date(0))))
        assert.throws(() => loose.deepEqual(masked(new Date(0)), masked(new Date(1))), /deep-equal/)
        assert.throws(() => loose.deepEqual(masked(new Date(0)), {}), /deep-equal/)
        assert.throws(() => loose.deepEqual({}, masked(new Date(0))), /deep-equal/)
        assert.throws(() => loose.deepEqual(masked(new Map([[1, 2]])), masked(new Map([[1, 3]]))), /deep-equal/)
    })
})
