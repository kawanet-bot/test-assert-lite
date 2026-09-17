// Pins the public entry surface. The declaration assignment makes tsc
// fail when a name declared in the published .d.ts is missing from the
// runtime entry; the test checks the same names on the built output.
import {strict as assert} from "node:assert"
import {createRequire} from "node:module"
import path from "node:path"
import {test} from "node:test"
import type * as declared from "test-assert-lite"
import * as m from "./index.ts"

const require = createRequire(import.meta.url)

const runtime: typeof declared = m
void runtime

// module-sync sends this to the ES module, since require(esm) exists on every
// version this package declares support for.
test("require entry", () => {
    const m: typeof declared = require("test-assert-lite")
    assert.equal(typeof m.createTAL, "function")
    assert.equal(typeof m.sharedTAL, "object")
    assert.equal(typeof m.sharedTAL.test, "function")
})

// The exports map has no "require" condition below module-sync, so reach
// the minified bundle by its path instead: beside the entry the package
// resolves to. An ES module, so this is require(esm) too.
test("minified entry (.min.js)", () => {
    const m: typeof declared = require(path.join(path.dirname(require.resolve("test-assert-lite")), "test-assert-lite.min.js"))
    assert.equal(typeof m.createTAL, "function")
    assert.equal(typeof m.sharedTAL, "object")
    assert.equal(typeof m.sharedTAL.test, "function")
})

test("import entry (.js)", () => {
    assert.equal(typeof m.createTAL, "function")
    assert.equal(typeof m.sharedTAL, "object")
    assert.equal(typeof m.sharedTAL.test, "function")
})

// The static variants hang off the callable, so they need their own check:
// a missing `it.skip` would still satisfy the declaration assignment above.
test("static variants", () => {
    assert.equal(typeof m.sharedTAL.describe.skip, "function")
    assert.equal(typeof m.sharedTAL.it.skip, "function")
    assert.equal(typeof m.sharedTAL.suite.skip, "function")
    assert.equal(typeof m.sharedTAL.test.skip, "function")
})

// `strict` doubles as `ok`, so the assertion helpers hang off the function.
test("assert surface", () => {
    assert.equal(typeof m.sharedTAL.assert.ok, "function")
    assert.equal(typeof m.sharedTAL.assert.deepEqual, "function")
    assert.equal(m.sharedTAL.assert.strict, m.sharedTAL.strict)
    assert.equal(typeof m.sharedTAL.strict.ok, "function")
    assert.equal(typeof m.sharedTAL.strict.equal, "function")
    assert.equal(typeof m.sharedTAL.strict.notEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.deepEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.notDeepEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.strictEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.notStrictEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.deepStrictEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.notDeepStrictEqual, "function")
    assert.equal(typeof m.sharedTAL.strict.throws, "function")
    assert.equal(typeof m.sharedTAL.strict.doesNotThrow, "function")
    assert.equal(typeof m.sharedTAL.strict.rejects, "function")
    assert.equal(typeof m.sharedTAL.strict.doesNotReject, "function")
    assert.equal(typeof m.sharedTAL.strict.match, "function")
    assert.equal(typeof m.sharedTAL.strict.doesNotMatch, "function")
    assert.equal(typeof m.sharedTAL.strict.ifError, "function")
    assert.equal(typeof m.sharedTAL.strict.fail, "function")
})

test("reporter surface", () => {
    assert.equal(typeof m.sharedTAL.reporter.spec, "function")
    assert.equal(typeof m.sharedTAL.reporter.tap, "function")
    assert.equal(typeof m.sharedTAL.reporter.html, "function")
})

// createTAL() hands out the same surface as the shared harness.
test("createTAL returns the same shape", () => {
    const h = m.createTAL()
    assert.equal(typeof h.suite, "function")
    assert.equal(typeof h.describe, "function")
    assert.equal(typeof h.test, "function")
    assert.equal(typeof h.it, "function")
    assert.equal(typeof h.before, "function")
    assert.equal(typeof h.after, "function")
    assert.equal(typeof h.assert, "function")
    assert.equal(typeof h.reporter, "object")
    assert.equal(typeof h.strict, "function")
})

// describe / it are aliases, not separate implementations.
test("aliases point at the same function", () => {
    assert.equal(m.sharedTAL.describe, m.sharedTAL.suite)
    assert.equal(m.sharedTAL.it, m.sharedTAL.test)
})
