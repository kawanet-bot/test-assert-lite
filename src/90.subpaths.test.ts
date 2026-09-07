// Pins the subpath entries. Each is a re-export of the root entry's objects,
// so the checks are identity against the root as the package resolves it,
// and the named lists must not drift from what the root exposes. The
// declaration assignments make tsc read the bridges' .d.mts too.
import {strict as assert} from "node:assert"
import {test} from "node:test"
import * as root from "test-assert-lite"
import * as assertEntry from "test-assert-lite/assert"
import * as strictEntry from "test-assert-lite/assert/strict"
import * as testEntry from "test-assert-lite/test"

const named = (entry: object): string[] => Object.keys(entry).filter(key => key !== "default").sort()

test("test-assert-lite/test", () => {
    const typed: typeof root.test = testEntry.default
    void typed
    assert.equal(testEntry.default, root.test)
    assert.deepEqual(named(testEntry), ["after", "before", "describe", "it", "suite", "test"])
    for (const key of named(testEntry)) {
        assert.equal(testEntry[key as keyof typeof testEntry], root[key as keyof typeof root], key)
    }
})

test("test-assert-lite/assert", () => {
    const typed: typeof root.assert = assertEntry.default
    void typed
    assert.equal(assertEntry.default, root.assert)
    assert.equal(assertEntry.strict, root.strict)
    assert.deepEqual(named(assertEntry), Object.keys(root.assert).sort())
    for (const key of named(assertEntry)) {
        assert.equal(assertEntry[key as keyof typeof assertEntry], root.assert[key as keyof typeof root.assert], key)
    }
})

test("test-assert-lite/assert/strict", () => {
    const typed: typeof root.strict = strictEntry.default
    void typed
    assert.equal(strictEntry.default, root.strict)
    assert.equal(strictEntry.strict, root.strict)
    assert.deepEqual(named(strictEntry), Object.keys(root.strict).sort())
    for (const key of named(strictEntry)) {
        assert.equal(strictEntry[key as keyof typeof strictEntry], root.strict[key as keyof typeof root.strict], key)
    }
})
