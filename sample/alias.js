// Fixture for builder/pack/Makefile's test-cli: a suite that reaches a
// bare specifier through --alias, in Node as in a browser.
import {strict as assert} from "node:assert"
import {test} from "node:test"
import {greet} from "greet"

test("resolves through --alias", () => {
    assert.equal(greet("alias"), "hello, alias")
})
