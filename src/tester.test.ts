import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {createTAL} from "./index.ts"
import {capture, names} from "./test-utils/capture.ts"

const TITLE = "tester.test.ts"

describe(TITLE, () => {
    it("skip option marks the test skipped without running it", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let ran = false
        local.it("skipped", {skip: "why"}, () => {
            ran = true
        })
        const summary = await local.run()

        assert.equal(ran, false)
        assert.equal(summary.counts.skipped, 1)
        assert.equal(summary.counts.passed, 0)
        const pass = events.find(e => e.type === "test:pass")
        assert.equal((pass?.data as {skip?: string}).skip, "why")
    })

    it("it.skip is the static form of the skip option", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let ran = false
        local.it.skip("static", () => {
            ran = true
        })
        const summary = await local.run()

        assert.equal(ran, false)
        assert.equal(summary.counts.skipped, 1)
    })

    it("t.skip() does not abort the body", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let reached = false
        local.it("runtime skip", (t) => {
            t.skip("later")
            reached = true
        })
        const summary = await local.run()

        assert.equal(reached, true)
        assert.equal(summary.counts.skipped, 1)
    })

    it("timeout option fails the test", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("slow", {timeout: 10}, async () => {
            await new Promise(r => setTimeout(r, 200))
        })
        const summary = await local.run()

        assert.equal(summary.counts.failed, 1)
        assert.equal(summary.success, false)
    })

    it("t.test() runs the subtest ahead of the rest of the parent", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.it("parent", async (t) => {
            order.push("parent start")
            await t.test("child", () => {
                order.push("child")
            })
            order.push("parent end")
        })
        const summary = await local.run()

        assert.equal(order.join(" | "), ["parent start", "child", "parent end"].join(" | "))
        assert.equal(summary.counts.tests, 2)
    })

    // A forgotten await does not lose the subtest. node:test gives up here,
    // so this errs on the safer side.
    it("an unawaited subtest still finishes before the parent is reported", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.it("parent", async (t) => {
            void t.test("child", async () => {
                await new Promise(r => setTimeout(r, 20))
                order.push("child")
            })
            order.push("parent body")
        })
        const summary = await local.run()

        assert.equal(order.join(" | "), ["parent body", "child"].join(" | "))
        assert.equal(summary.counts.tests, 2)
        assert.equal(summary.counts.passed, 2)
    })

    it("a failing subtest is counted and flips success", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("parent", async (t) => {
            await t.test("bad child", () => {
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        assert.equal(summary.counts.tests, 2)
        assert.equal(summary.counts.failed, 1)
        assert.equal(summary.success, false)
    })

    it("t.diagnostic() emits an info event", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("noisy", (t) => {
            t.diagnostic("hello")
        })
        await local.run()

        const found = events.find(e => e.type === "test:diagnostic" && e.data.message === "hello")
        assert.ok(found)
        assert.equal((found?.data as {level: string}).level, "info")
    })

    it("t.assert is available on the context", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let caught: unknown
        local.it("asserting", (t) => {
            t.assert.equal(1, 1)
            try {
                t.assert.equal(1, 2)
            } catch (e) {
                caught = e
            }
        })
        await local.run()

        assert.ok(caught instanceof Error)
        assert.equal((caught as Error & {code?: string}).code, "ERR_ASSERTION")
    })

    it("the context carries the test name", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let seen = ""
        local.it("named", (t) => {
            seen = t.name
        })
        await local.run()

        assert.equal(seen, "named")
    })

    it("an anonymous test falls back to the function name", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it(function namedFn() {
            // With no name the function name is used, as in node:test.
        })
        local.it(() => undefined)
        await local.run()

        assert.equal(names(events, "test:pass").join(" | "), ["namedFn", "<anonymous>"].join(" | "))
    })
})
