import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {errorText, TesterError} from "./tester-error.ts"

const TITLE = "common/tester-error.test.ts"

// A stack in the shape Safari and Firefox produce: frames only, no
// "name: message" line above them.
const framesOnly = (error: Error): Error => Object.assign(error, {stack: "fn@http://host/suite.mjs:12:3\n@http://host/suite.mjs:40:1"})

describe(TITLE, () => {
    // V8 already opens with that line; the other engines get it added.
    it("opens with name and message whatever the engine's own stack looks like", () => {
        const error = new Error("boom")
        const text = errorText(error)
        assert.match(text, /^Error: boom\n/)
        assert.ok(text.endsWith(error.stack!.replace(/^Error: boom\n/, "")), "the frames follow unchanged")
    })

    it("puts name and message above a stack that lists frames only", () => {
        const text = errorText(framesOnly(new RangeError("boom")))
        assert.equal(text, "RangeError: boom\nfn@http://host/suite.mjs:12:3\n@http://host/suite.mjs:40:1")
    })

    // The frame's function name is not a header, however it starts.
    it("is not fooled by a first frame whose function name starts with the error's name", () => {
        const error = Object.assign(new Error("boom"), {stack: "ErrorHandler@http://host/suite.mjs:12:3\n@http://host/suite.mjs:40:1"})
        assert.equal(errorText(error), "Error: boom\nErrorHandler@http://host/suite.mjs:12:3\n@http://host/suite.mjs:40:1")
        // A multi-line message spans the header, as V8 writes it.
        const v8 = "Error: l1\nl2\n    at fn (http://host/suite.mjs:12:3)"
        assert.equal(errorText(Object.assign(new Error("l1\nl2"), {stack: v8})), v8)
    })

    it("uses the name alone when the message is empty", () => {
        assert.equal(errorText(framesOnly(new Error())), "Error\nfn@http://host/suite.mjs:12:3\n@http://host/suite.mjs:40:1")
        assert.equal(errorText(Object.assign(new Error(), {stack: undefined})), "Error")
    })

    it("falls back to name and message without a stack", () => {
        assert.equal(errorText(Object.assign(new TypeError("boom"), {stack: undefined})), "TypeError: boom")
    })

    it("reads through a TesterError to its Error cause, and to the message otherwise", () => {
        const cause = framesOnly(new Error("inner"))
        assert.match(errorText(new TesterError("outer", "testCodeFailure", cause)), /^Error: inner\nfn@/)
        assert.equal(errorText(new TesterError("thrown a string", "testCodeFailure", "thrown a string")), "thrown a string")
    })

    it("stringifies a value that is not an Error", () => {
        assert.equal(errorText(42), "42")
        assert.equal(errorText(undefined), "undefined")
    })
})
