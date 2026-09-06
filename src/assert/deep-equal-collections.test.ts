import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {strict as TAL} from "./../index.ts"

const TITLE = "assert/deep-equal-collections.test.ts"

describe(TITLE, () => {
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
