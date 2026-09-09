import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"

const TITLE = "common/tester-error.test.ts"

// The lines the spec reporter prints under a failed test, which are the
// error's text indented by two spaces.
const detail = async (error: unknown): Promise<string[]> => {
    const local = createTAL()
    const lines: string[] = []
    local.reporter.format(local.reporter.spec({colors: false}))
    local.reporter.output(text => {
        lines.push(text)
    })
    // Typed as an Error, though a runner may hand over any thrown value.
    await local.reporter.emit("test:fail", {name: "bad", nesting: 0, testNumber: 1, details: {duration_ms: 1, type: "test", error: error as Error}})
    await local.run()
    return lines.join("").split("\n").filter(line => line.startsWith("  ")).map(line => line.slice(2))
}

const withStack = (error: Error, stack: string | undefined): Error => Object.assign(error, {stack})

describe(TITLE, () => {
    // The engine's own stack differs by engine and version, so only the
    // line on top is checked here.
    it("opens with name and message, once", async () => {
        const lines = await detail(new Error("boom"))
        assert.equal(lines[0], "Error: boom")
        assert.notEqual(lines[1], "Error: boom")
    })

    // What V8 writes on top: name and message, the code Node adds, a name
    // alone, a message over several lines.
    it("keeps a stack that opens with a header", async () => {
        for (const stack of [
            "Error: boom\n    at fn (http://host/suite.mjs:12:3)",
            "AssertionError [ERR_ASSERTION]: 1 == 2\n    at fn (http://host/suite.mjs:12:3)",
            "Error\n    at fn (http://host/suite.mjs:12:3)",
            "Error: l1\nl2\n    at fn (http://host/suite.mjs:12:3)",
        ]) {
            assert.deepEqual(await detail(withStack(new Error("boom"), stack)), stack.split("\n"), stack)
        }
    })

    // Safari and Firefox list the frames only, fn@url each: the line goes
    // on top, however the first frame or the message reads.
    it("adds name and message above frames-only stacks", async () => {
        for (const [error, stack] of [
            [new RangeError("boom"), "fn@http://host/suite.mjs:12:3\n@http://host/suite.mjs:40:1"],
            [new Error("boom"), "ErrorHandler@http://host/suite.mjs:12:3"],
            [new Error("fn"), "fn@http://host/suite.mjs:12:3"],
        ] as const) {
            assert.deepEqual(await detail(withStack(error, stack)), [`${error.name}: ${error.message}`, ...stack.split("\n")], stack)
        }
    })

    it("falls back to name and message without a stack", async () => {
        assert.deepEqual(await detail(withStack(new TypeError("boom"), undefined)), ["TypeError: boom"])
    })

    // node:test wraps a failure in ERR_TEST_FAILURE with the Error as
    // cause; TAL wraps only a thrown value that is not an Error.
    it("reads through a test failure wrapper to its cause", async () => {
        const cause = withStack(new Error("inner"), "fn@http://host/suite.mjs:12:3")
        assert.deepEqual(await detail(Object.assign(new Error("outer"), {code: "ERR_TEST_FAILURE", cause})), ["Error: inner", "fn@http://host/suite.mjs:12:3"])
    })

    it("prints a thrown value that is not an Error as it is", async () => {
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
        assert.match(lines.join(""), /\n {2}thrown a string\n/)
        assert.deepEqual(await detail(42), ["42"])
    })
})
