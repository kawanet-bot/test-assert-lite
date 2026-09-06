import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {strict as TAL} from "./../index.ts"

const TITLE = "assert/deep-equal-collections.test.ts"

describe(TITLE, () => {
    // Not specially handled, but the tag check plus the length check above
    // make this work anyway: a typed array's elements are own enumerable
    // indices, same as a plain array's.
    it("compares typed arrays element by element", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])))
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]), new Int8Array([1, 2])), /deep-equal/)
    })

    // Deliberate trade-off for large-buffer performance: a direct indexed
    // loop skips Object.keys() entirely, so a custom own enumerable property
    // added on top of a typed array's indices - not a realistic pattern for
    // one - goes unnoticed, unlike a plain array's would.
    it("does not notice an extra own property on a typed array (documented trade-off)", () => {
        const withExtra = Object.assign(new Uint8Array([1, 2]), {tag: 1})
        assert.doesNotThrow(() => TAL.deepEqual(withExtra, new Uint8Array([1, 2])))
    })

    // Set/Map compare their elements/entries regardless of insertion order,
    // then fall through to compare any extra own enumerable property too.
    it("compares Set/Map contents order-independently, by deep equality", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Set([1, 2]), new Set([2, 1])))
        assert.throws(() => TAL.deepEqual(new Set([1, 2]), new Set([1, 3])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Set([1, 2]), new Set([1])), /deep-equal/)
        // Deep, not just ===: object elements/keys/values are matched by content.
        assert.doesNotThrow(() => TAL.deepEqual(new Set([{a: 1}]), new Set([{a: 1}])))

        assert.doesNotThrow(() => TAL.deepEqual(
            new Map([["a", 1], ["b", 2]]),
            new Map([["b", 2], ["a", 1]]),
        ))
        assert.throws(() => TAL.deepEqual(new Map([["a", 1]]), new Map([["a", 2]])), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual(new Map([[{k: 1}, "v"]]), new Map([[{k: 1}, "v"]])))

        const withExtra = Object.assign(new Map(), {tag: 1})
        assert.throws(() => TAL.deepEqual(withExtra, new Map()), /deep-equal/)
    })

    // Set/Map first clear out primitives and same-reference elements via
    // has()/get() (SameValueZero) before falling back to a deep-equality
    // match for the rest; this pins down that fast path's own edge cases,
    // which differ from the deep-equality path's (Object.is-based) semantics
    // since a Set/Map cannot hold both -0 and +0 as distinct keys/elements.
    it("keeps -0/+0 and NaN semantics correct through the Set/Map fast path", () => {
        // Real node agrees: Set elements are deduplicated by SameValueZero at
        // construction, so -0 and +0 were never distinguishable as elements.
        assert.doesNotThrow(() => TAL.deepEqual(new Set([-0]), new Set([0])))
        assert.doesNotThrow(() => TAL.deepEqual(new Set([NaN]), new Set([NaN])))
        // Map values are not deduplicated, so -0 vs +0 must still differ here.
        assert.throws(() => TAL.deepEqual(new Map([["k", -0]]), new Map([["k", 0]])), /deep-equal/)
        assert.doesNotThrow(() => TAL.deepEqual(new Map([["k", NaN]]), new Map([["k", NaN]])))
    })

    // ArrayBuffer/DataView compare their bytes, a DataView windowed by its
    // own byteOffset/byteLength rather than its whole backing buffer's.
    it("compares ArrayBuffer/DataView by byte content", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer))
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer), /deep-equal/)

        const view = (bytes: number[], offset: number, length: number): DataView =>
            new DataView(new Uint8Array(bytes).buffer, offset, length)
        assert.doesNotThrow(() => TAL.deepEqual(view([0, 1, 2, 3], 1, 2), view([9, 1, 2, 9], 1, 2)))
        assert.throws(() => TAL.deepEqual(view([0, 1, 2, 3], 1, 2), view([0, 1, 9, 3], 1, 2)), /deep-equal/)
    })

    // SharedArrayBuffer isn't an instanceof ArrayBuffer, so it needs its own
    // tag check to reach the same byte-comparison path. The global itself
    // does not exist in a non-cross-origin-isolated browser (this suite's
    // own browser run included), unlike in Node, so this skips there rather
    // than crashing on a bare reference to it.
    it("compares SharedArrayBuffer by byte content too", {skip: "undefined" === typeof SharedArrayBuffer}, () => {
        const bytes = (buf: SharedArrayBuffer, ...values: number[]): SharedArrayBuffer => {
            new Uint8Array(buf).set(values)
            return buf
        }
        assert.doesNotThrow(() => TAL.deepEqual(
            bytes(new SharedArrayBuffer(2), 1, 2),
            bytes(new SharedArrayBuffer(2), 1, 2),
        ))
        assert.throws(() => TAL.deepEqual(
            bytes(new SharedArrayBuffer(2), 1, 2),
            bytes(new SharedArrayBuffer(2), 1, 3),
        ), /deep-equal/)
        // An ArrayBuffer and a SharedArrayBuffer are still a different kind.
        assert.throws(() => TAL.deepEqual(bytes(new SharedArrayBuffer(2), 1, 2), new Uint8Array([1, 2]).buffer), /deep-equal/)
    })

    // WeakMap/WeakSet/Promise cannot be introspected at all (or, for a
    // Promise, only asynchronously), so only a shared reference is treated
    // as equal for them - a hard platform limit, not a scope choice.
    it("only treats WeakMap/WeakSet/Promise as equal by reference", () => {
        assert.doesNotThrow(() => {
            const shared = new WeakMap()
            TAL.deepEqual(shared, shared)
        })
        const key = {}
        assert.throws(() => TAL.deepEqual(new WeakMap([[key, 1]]), new WeakMap([[key, 1]])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new WeakSet([key]), new WeakSet([key])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(Promise.resolve(1), Promise.resolve(1)), /deep-equal/)
    })
})
