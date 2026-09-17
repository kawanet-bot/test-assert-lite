// Fixture for builder/pack/Makefile's test-cli: a file the CLI can load
// that fails, to check the exit code on the failure path end to end.
import {test} from "node:test"

test("fails", () => {
    throw new Error("expected failure")
})
