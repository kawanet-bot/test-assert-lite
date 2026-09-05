import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {strict as TAL} from "./../index.ts"

const TITLE = "assert/assertion-error.test.ts"

// The formatter is not exported, so read what it produced out of equal()'s
// message, whose shape is fixed at `expected <expected>, got <actual>`.
const PREFIX = "expected 0, got "

const rendered = (value: unknown): string => {
    let message = ""
    try {
        TAL.equal(value, 0)
    } catch (e) {
        message = (e as Error).message
    }
    assert.ok(message.startsWith(PREFIX), `equal() did not fail as expected: ${message}`)
    return message.slice(PREFIX.length)
}

// A self-referencing array. Without a depth cut-off this recurses forever.
const selfReferencing = (): unknown[] => {
    const array: unknown[] = []
    array.push(array)
    return array
}

// Two arrays referencing each other. Miscounting the depth lets this one
// run away a level later than the self-referencing case does.
const mutuallyReferencing = (): unknown[] => {
    const array: unknown[] = []
    array.push([array])
    return array
}

describe(TITLE, () => {
    it("quotes a string so it cannot be confused with a bare word", () => {
        assert.equal(rendered("a"), `"a"`)
        assert.equal(rendered("1"), `"1"`)
    })

    it("reduces an Error to its name and message", () => {
        assert.equal(rendered(new TypeError("boom")), "TypeError: boom")
    })

    it("renders a primitive through String()", () => {
        assert.equal(rendered(1), "1")
        assert.equal(rendered(undefined), "undefined")
        assert.equal(rendered(null), "null")
        assert.equal(rendered(NaN), "NaN")
    })

    // An object is left alone, since its contents can be arbitrarily large.
    it("leaves an object unexpanded", () => {
        assert.equal(rendered({a: 1}), "[object Object]")
    })

    // A bare String(array) renders [1,2], ["1","2"] and [undefined] alike,
    // which invites the wrong conclusion from a failure message.
    it("expands the elements of an array so they stay distinguishable", () => {
        assert.equal(rendered([]), "[]")
        assert.equal(rendered([1, 2]), "[1,2]")
        assert.equal(rendered(["a", "b"]), `["a","b"]`)
        assert.equal(rendered(["a,b"]), `["a,b"]`)
        assert.equal(rendered([undefined]), "[undefined]")
        assert.equal(rendered([null]), "[null]")
    })

    // Two dimensions are common enough in a failure message to be worth showing.
    it("expands a table of rows and columns", () => {
        assert.equal(rendered([[1], [2]]), "[[1],[2]]")
        assert.equal(rendered([[1, 2], [3, 4]]), "[[1,2],[3,4]]")
    })

    it("marks the elements it did not expand", () => {
        assert.equal(rendered([[[1]]]), "[[[...]]]")
        assert.equal(rendered([[1, [2]]]), "[[1,[...]]]")
    })

    // Folding something empty into "..." reads as hidden content.
    it("expands an empty array even below the cut-off", () => {
        assert.equal(rendered([[]]), "[[]]")
        assert.equal(rendered([[[]]]), "[[[]]]")
        assert.equal(rendered([[], [1]]), "[[],[1]]")
    })

    // Without the cut-off this fails with a RangeError. No other test passes
    // a circular array, so this is the only place a regression shows up.
    it("terminates on a circular array", () => {
        assert.equal(rendered(selfReferencing()), "[[[...]]]")
        assert.equal(rendered(mutuallyReferencing()), "[[[...]]]")
    })
})
