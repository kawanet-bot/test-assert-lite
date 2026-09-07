// Fixture for the browser CLI: a suite that reaches a sibling module and
// one in a subdirectory by relative import, the way a project's tests
// reach their own code. Both resolve under the suite's mounted directory.
import {strict as assert, test} from "test-assert-lite"
import {answer} from "./helper.mjs"
import {greet} from "./lib/greet.mjs"

test("imports a sibling module", () => {
    assert.equal(answer(), 42)
})

test("imports a module from a subdirectory", () => {
    assert.equal(greet("browser"), "hello, browser")
})
