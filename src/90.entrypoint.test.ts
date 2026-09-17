// Pins the public entry surface: createTAL() and the harness it shares.
// The declaration assignment makes tsc fail when a name declared in the
// published .d.ts is missing from the runtime entry; the tests check the
// same two names on the built outputs, and the harness's shape once.
import {strict as assert} from "node:assert"
import {createRequire} from "node:module"
import path from "node:path"
import {test} from "node:test"
import type * as declared from "test-assert-lite"
import * as m from "./index.ts"

const require = createRequire(import.meta.url)

const runtime: typeof declared = m
void runtime

const entry = (m: typeof declared): void => {
    assert.equal(typeof m.createTAL, "function")
    assert.equal(typeof m.sharedTAL, "object")
    assert.equal(typeof m.sharedTAL.test, "function")
}

// module-sync sends this to the ES module, since require(esm) exists on every
// version this package declares support for.
test("require entry", () => {
    entry(require("test-assert-lite"))
})

// The exports map has no "require" condition below module-sync, so reach
// the minified bundle by its path instead: beside the entry the package
// resolves to. An ES module, so this is require(esm) too.
test("minified entry (.min.js)", () => {
    entry(require(path.join(path.dirname(require.resolve("test-assert-lite")), "test-assert-lite.min.js")))
})

test("import entry (.js)", () => {
    entry(m)
})

// The harness's members, and the static variants that hang off the
// callables: a missing `it.skip` would still satisfy the declaration
// assignment above.
test("the shared harness", () => {
    const h = m.sharedTAL
    assert.equal(typeof h.after, "function")
    assert.equal(typeof h.assert, "function")
    assert.equal(typeof h.before, "function")
    assert.equal(typeof h.describe, "function")
    assert.equal(typeof h.end, "function")
    assert.equal(typeof h.it, "function")
    assert.equal(typeof h.reporter, "object")
    assert.equal(typeof h.session, "function")
    assert.equal(typeof h.strict, "function")
    assert.equal(typeof h.suite, "function")
    assert.equal(typeof h.test, "function")
    assert.equal(typeof h.describe.skip, "function")
    assert.equal(typeof h.it.skip, "function")
    assert.equal(typeof h.suite.skip, "function")
    assert.equal(typeof h.test.skip, "function")
})

// `strict` doubles as `ok`, so the assertion helpers hang off the function.
test("assert surface", () => {
    const {assert: loose, strict} = m.sharedTAL
    assert.equal(typeof loose.ok, "function")
    assert.equal(typeof loose.deepEqual, "function")
    assert.equal(loose.strict, strict)
    for (const name of [
        "ok", "equal", "notEqual", "deepEqual", "notDeepEqual", "strictEqual", "notStrictEqual",
        "deepStrictEqual", "notDeepStrictEqual", "throws", "doesNotThrow", "rejects", "doesNotReject",
        "match", "doesNotMatch", "ifError", "fail",
    ] as const) {
        assert.equal(typeof strict[name], "function", name)
    }
})

test("reporter surface", () => {
    const {reporter} = m.sharedTAL
    assert.equal(typeof reporter.spec, "function")
    assert.equal(typeof reporter.tap, "function")
    assert.equal(typeof reporter.html, "function")
})

// createTAL() hands out the same shape, apart from the shared one.
test("createTAL returns the same shape, another instance", () => {
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
    assert.notEqual(h.test, m.sharedTAL.test)
})

// describe / it are aliases, not separate implementations.
test("aliases point at the same function", () => {
    assert.equal(m.sharedTAL.describe, m.sharedTAL.suite)
    assert.equal(m.sharedTAL.it, m.sharedTAL.test)
})
