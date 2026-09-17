// Pins the subpath entries. Each takes its objects from the shared harness,
// so the checks are identity against it as the package resolves it, and
// the named lists must not drift from what the harness exposes. The
// declaration assignments make tsc read the bridges' .d.ts too.
import {strict as assert} from "node:assert"
import {test} from "node:test"
import {sharedTAL as root} from "test-assert-lite"
import * as assertEntry from "test-assert-lite/assert"
import * as strictEntry from "test-assert-lite/assert/strict"
import * as htmlEntry from "test-assert-lite/reporter/html"
import * as specEntry from "test-assert-lite/reporter/spec"
import * as tapEntry from "test-assert-lite/reporter/tap"
import * as sessionEntry from "test-assert-lite/session"
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

test("test-assert-lite/session", () => {
    const typed: typeof root.session.session = sessionEntry.session
    void typed
    assert.equal(sessionEntry.session, root.session.session)
    assert.equal(sessionEntry.load, root.session.load)
    assert.equal(sessionEntry.end, root.session.end)
    assert.deepEqual(named(sessionEntry), ["end", "load", "session"])
})

test("test-assert-lite/reporter/html", () => {
    assert.equal(typeof htmlEntry.default, "function")
})

test("test-assert-lite/reporter/spec", () => {
    assert.equal(typeof specEntry.default, "function")
})

test("test-assert-lite/reporter/tap", () => {
    assert.equal(typeof tapEntry.default, "function")
})
