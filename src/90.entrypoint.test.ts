// Pins the public entry surface. The declaration assignment makes tsc
// fail when a name declared in the published .d.ts is missing from the
// runtime entry; the test checks the same names on the built output.
import {strict as assert} from "node:assert"
import {test} from "node:test"

import type * as declared from "test-assert-lite"
import * as m from "./index.ts"

const runtime: typeof declared = m
void runtime

test("import entry (.mjs)", () => {
    assert.equal(typeof m.after, "function")
    assert.equal(typeof m.before, "function")
    assert.equal(typeof m.createTAL, "function")
    assert.equal(typeof m.describe, "function")
    assert.equal(typeof m.it, "function")
    assert.equal(typeof m.reporter, "object")
    assert.equal(typeof m.run, "function")
    assert.equal(typeof m.strict, "function")
    assert.equal(typeof m.suite, "function")
    assert.equal(typeof m.test, "function")
})

// The static variants hang off the callable, so they need their own check:
// a missing `it.skip` would still satisfy the declaration assignment above.
test("static variants", () => {
    assert.equal(typeof m.describe.skip, "function")
    assert.equal(typeof m.it.skip, "function")
    assert.equal(typeof m.suite.skip, "function")
    assert.equal(typeof m.test.skip, "function")
})

// `strict` doubles as `ok`, so the assertion helpers hang off the function.
test("assert surface", () => {
    assert.equal(typeof m.strict.ok, "function")
    assert.equal(typeof m.strict.equal, "function")
    assert.equal(typeof m.strict.notEqual, "function")
    assert.equal(typeof m.strict.strictEqual, "function")
    assert.equal(typeof m.strict.notStrictEqual, "function")
    assert.equal(typeof m.strict.throws, "function")
    assert.equal(typeof m.strict.doesNotThrow, "function")
    assert.equal(typeof m.strict.match, "function")
    assert.equal(typeof m.strict.doesNotMatch, "function")
    assert.equal(typeof m.strict.ifError, "function")
    assert.equal(typeof m.strict.fail, "function")
})

test("reporter surface", () => {
    assert.equal(typeof m.reporter.emit, "function")
    assert.equal(typeof m.reporter.format, "function")
    assert.equal(typeof m.reporter.output, "function")
    assert.equal(typeof m.reporter.spec, "function")
    assert.equal(typeof m.reporter.html, "function")
})

// createTAL() hands out the same surface as the named exports.
test("createTAL returns the same shape", () => {
    const h = m.createTAL()
    assert.equal(typeof h.suite, "function")
    assert.equal(typeof h.describe, "function")
    assert.equal(typeof h.test, "function")
    assert.equal(typeof h.it, "function")
    assert.equal(typeof h.before, "function")
    assert.equal(typeof h.after, "function")
    assert.equal(typeof h.run, "function")
    assert.equal(typeof h.reporter, "object")
    assert.equal(typeof h.strict, "function")
})

// describe / it are aliases, not separate implementations.
test("aliases point at the same function", () => {
    assert.equal(m.describe, m.suite)
    assert.equal(m.it, m.test)
})
