import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"

const TITLE = "common/tester-error.test.ts"

// How a failure's error reaches the output, seen through the spec
// reporter: every reporter renders the same text, and spec indents its
// lines by two spaces, so those are the lines collected here.
const detail = async (error: unknown): Promise<string[]> => {
    const local = createTAL()
    const lines: string[] = []
    local.reporter.format(local.reporter.spec({colors: false}))
    local.reporter.output(text => {
        lines.push(text)
    })
    await local.reporter.emit("test:fail", {
        name: "bad", nesting: 0, testNumber: 1,
        // Typed as an Error, though a runner may hand over any thrown value.
        details: {duration_ms: 1, type: "test", error: error as Error},
    })
    await local.run()
    return lines.join("").split("\n").filter(line => line.startsWith("  ")).map(line => line.slice(2))
}

const FRAMES = ["fn@http://host/suite.mjs:12:3", "@http://host/suite.mjs:40:1"]

// A stack in the shape Safari and Firefox produce: frames only, no
// "name: message" line above them.
const framesOnly = (error: Error): Error => Object.assign(error, {stack: FRAMES.join("\n")})

describe(TITLE, () => {
    // V8 already opens with that line; the other engines get it added.
    it("opens with name and message whatever the engine's own stack looks like", async () => {
        const error = new Error("boom")
        const lines = await detail(error)
        assert.equal(lines[0], "Error: boom")
        assert.notEqual(lines[1], "Error: boom", "the line is not repeated")
        assert.ok(lines.length > 1, "the frames follow")
    })

    it("puts name and message above a stack that lists frames only", async () => {
        assert.deepEqual(await detail(framesOnly(new RangeError("boom"))), ["RangeError: boom", ...FRAMES])
    })

    // The frame's function name is not a header, however it starts, and
    // neither is a message that happens to be a function's name.
    it("reads the first line by its shape, not by the error's name or message", async () => {
        const named = Object.assign(new Error("boom"), {stack: `ErrorHandler@http://host/suite.mjs:12:3`})
        assert.deepEqual(await detail(named), ["Error: boom", "ErrorHandler@http://host/suite.mjs:12:3"])
        const same = Object.assign(new Error("fn"), {stack: "fn@http://host/suite.mjs:12:3"})
        assert.deepEqual(await detail(same), ["Error: fn", "fn@http://host/suite.mjs:12:3"])
    })

    // What V8 writes on top is kept as it is: a multi-line message, the
    // code Node adds as AssertionError [ERR_ASSERTION], a name alone.
    it("keeps a V8 header of every shape", async () => {
        const v8 = (stack: string, error: Error): Error => Object.assign(error, {stack})
        const multi = "Error: l1\nl2\n    at fn (http://host/suite.mjs:12:3)"
        assert.deepEqual(await detail(v8(multi, new Error("l1\nl2"))), multi.split("\n"))
        const coded = "AssertionError [ERR_ASSERTION]: 1 == 2\n    at fn (http://host/suite.mjs:12:3)"
        assert.deepEqual(await detail(v8(coded, Object.assign(new Error("1 == 2"), {name: "AssertionError"}))), coded.split("\n"))
        const bare = "Error\n    at fn (http://host/suite.mjs:12:3)"
        assert.deepEqual(await detail(v8(bare, new Error())), bare.split("\n"))
    })

    it("uses the name alone when the message is empty", async () => {
        assert.deepEqual(await detail(framesOnly(new Error())), ["Error", ...FRAMES])
        assert.deepEqual(await detail(Object.assign(new Error(), {stack: undefined})), ["Error"])
    })

    // The header is what Error.prototype.toString gives, as V8 writes it.
    it("writes the message alone when the name is empty", async () => {
        const nameless = (stack: string): Error => Object.assign(new Error("boom"), {name: "", stack})
        assert.deepEqual(await detail(nameless("boom\n    at fn (http://host/suite.mjs:12:3)")), ["boom", "    at fn (http://host/suite.mjs:12:3)"])
        assert.deepEqual(await detail(nameless(FRAMES.join("\n"))), ["boom", ...FRAMES])
        const blank = Object.assign(new Error(""), {name: "", stack: FRAMES.join("\n")})
        assert.deepEqual(await detail(blank), FRAMES)
    })

    it("falls back to name and message without a stack", async () => {
        assert.deepEqual(await detail(Object.assign(new TypeError("boom"), {stack: undefined})), ["TypeError: boom"])
    })

    // node:test wraps a failure in ERR_TEST_FAILURE with the Error as cause;
    // TAL wraps only a thrown value that is not an Error, keeping the value
    // as the message.
    it("reads through a test failure wrapper to its cause, or to the message", async () => {
        const cause = framesOnly(new Error("inner"))
        const wrapped = Object.assign(new Error("outer"), {code: "ERR_TEST_FAILURE", cause})
        assert.deepEqual(await detail(wrapped), ["Error: inner", ...FRAMES])

        const local = createTAL()
        const lines: string[] = []
        local.reporter.format(local.reporter.spec({colors: false}))
        local.reporter.output(text => {
            lines.push(text)
        })
        local.it("throws a string", () => {
            throw "thrown a string"
        })
        await local.run()
        assert.match(lines.join(""), /\n  thrown a string\n/)
    })

    it("stringifies a value that is not an Error", async () => {
        assert.deepEqual(await detail(42), ["42"])
        assert.deepEqual(await detail(undefined), ["undefined"])
    })
})
