import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type * as declared from "test-assert-lite"
import {createTAL} from "../index.ts"

const TITLE = "tap.test.ts"

const render = async (
    emit: (reporter: ReturnType<typeof createTAL>["reporter"]) => Promise<void>,
): Promise<string> => {
    const local = createTAL()
    const lines: string[] = []
    local.reporter.format(local.reporter.tap())
    local.reporter.output(text => {
        lines.push(text)
    })
    await emit(local.reporter)
    await local.run()
    return lines.join("")
}

const pass = (name: string, extra: object = {}) => ({
    name, nesting: 0, testNumber: 1,
    details: {duration_ms: 1, type: "test" as const}, ...extra,
})

const summary = (counts: declared.TAL.TestSummary["counts"]) => ({counts, duration_ms: 1, success: true})

describe(TITLE, () => {
    it("opens with the TAP version line", async () => {
        const out = await render(() => Promise.resolve())

        assert.match(out, /^TAP version 13\n/)
    })

    it("numbers passing and failing tests in stream order", async () => {
        const out = await render(async r => {
            await r.emit("test:pass", pass("one"))
            await r.emit("test:fail", {...pass("two"), details: {duration_ms: 1, type: "test", error: new Error("boom")}})
        })

        assert.match(out, /ok 1 - one\n/)
        assert.match(out, /not ok 2 - two\n/)
        assert.match(out, /1\.\.2\n/)
    })

    it("reports a skip as ok regardless of the underlying result", async () => {
        const out = await render(async r => {
            await r.emit("test:pass", pass("later", {skip: "not yet"}))
            await r.emit("test:fail", {
                ...pass("also skipped"), skip: true,
                details: {duration_ms: 1, type: "test", error: new Error("boom")},
            })
        })

        assert.match(out, /ok 1 - later # SKIP not yet\n/)
        assert.match(out, /ok 2 - also skipped # SKIP\n/)
        assert.equal(out.includes("not ok"), false)
    })

    it("leaves a suite result out of the count and the plan", async () => {
        const out = await render(async r => {
            await r.emit("test:fail", {...pass("child"), details: {duration_ms: 1, type: "test", error: new Error("boom")}})
            await r.emit("test:fail", {
                ...pass("S"), details: {duration_ms: 2, type: "suite", error: new Error("1 subtest failed")},
            })
            await r.emit("test:summary", summary({tests: 1, passed: 0, failed: 1, skipped: 0, cancelled: 0, suites: 1}))
        })

        assert.match(out, /1\.\.1\n/)
        assert.match(out, /# tests 1\n/)
        assert.match(out, /# fail 1\n/)
        assert.equal(/(?:ok|not ok) \d+ - S\b/.test(out), false)
    })

    it("writes an error diagnostic block under a failing line", async () => {
        const out = await render(r => r.emit("test:fail", {
            ...pass("bad"), details: {duration_ms: 1, type: "test", error: new Error("boom")},
        }))

        assert.match(out, /not ok 1 - bad\n {2}---\n {2}message: "Error: boom.*"\n {2}\.\.\.\n/)
    })

    it("turns test:start into a Subtest comment", async () => {
        const out = await render(r => r.emit("test:start", {name: "outer", nesting: 0}))

        assert.match(out, /# Subtest: outer\n/)
    })

    it("turns a diagnostic into a TAP comment", async () => {
        const out = await render(r => r.emit("test:diagnostic", {message: "hello", nesting: 0, level: "info"}))

        assert.match(out, /# hello\n/)
    })

    it("closes with a plan and counts taken from the final summary", async () => {
        const out = await render(async r => {
            await r.emit("test:pass", pass("a"))
            await r.emit("test:fail", {...pass("b"), details: {duration_ms: 1, type: "test", error: new Error("x")}})
            await r.emit("test:pass", pass("c", {skip: true}))
            await r.emit("test:summary", summary({tests: 3, passed: 1, failed: 1, skipped: 1, cancelled: 0, suites: 0}))
        })

        assert.match(out, /1\.\.3\n# tests 3\n# pass 1\n# fail 1\n# skip 1\n/)
    })
})
