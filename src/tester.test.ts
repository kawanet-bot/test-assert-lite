import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {createTAL} from "./index.ts"
import {capture, names, ofType} from "./test-utils/capture.ts"

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

    // node:test files a timeout under cancelled, not failed.
    it("timeout option cancels the test", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: 10}, async () => {
            await new Promise(r => setTimeout(r, 200))
        })
        const summary = await local.run()

        assert.equal(summary.counts.cancelled, 1)
        assert.equal(summary.counts.failed, 0)
        assert.equal(summary.success, false)
        const error = ofType(events, "test:fail")[0]?.data.details.error as Error & {code?: string, failureType?: string}
        assert.equal(error?.name, "TestRunnerError")
        assert.equal(error?.code, "ERR_TEST_FAILURE")
        assert.equal(error?.failureType, "testTimeoutFailure")
        assert.equal(error?.message, "test timed out after 10ms")
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

    // node:test fails the parent as subtestsFailed, so both are counted.
    it("a failing subtest fails the parent as well", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", async (t) => {
            await t.test("bad child", () => {
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        assert.equal(summary.counts.tests, 2)
        assert.equal(summary.counts.failed, 2)
        assert.equal(summary.success, false)
        const parent = ofType(events, "test:fail").find(e => e.data.name === "parent")?.data.details.error as Error & {failureType?: string}
        assert.equal(parent?.failureType, "subtestsFailed")
        assert.equal(parent?.message, "1 subtest failed")
    })

    it("an unawaited failing subtest still fails the parent", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("parent", async (t) => {
            void t.test("bad child", () => {
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        assert.equal(summary.counts.failed, 2)
        assert.equal(summary.success, false)
    })

    // The child is filed under cancelled, the parent under failed.
    it("a timed out subtest fails the parent", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("parent", async (t) => {
            await t.test("slow child", {timeout: 10}, async () => {
                await new Promise(r => setTimeout(r, 200))
            })
        })
        const summary = await local.run()

        assert.equal(summary.counts.cancelled, 1)
        assert.equal(summary.counts.failed, 1)
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

    // An Error is reported as thrown so its own fields stay reachable;
    // anything else is wrapped so that details.error is always an Error.
    it("a thrown Error passes through and a thrown value is wrapped", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        const thrown = new RangeError("as is")
        local.it("error", () => {
            throw thrown
        })
        local.it("string", () => {
            throw "just text"
        })
        await local.run()

        const [first, second] = ofType(events, "test:fail").map(e => e.data.details.error as Error & {cause?: unknown, failureType?: string})
        assert.equal(first, thrown)
        assert.equal(second?.name, "TestRunnerError")
        assert.equal(second?.failureType, "testCodeFailure")
        assert.equal(second?.message, "just text")
        assert.equal(second?.cause, "just text")
    })

    // node:test runs subtests one at a time. Without that, a slow first
    // child is still running when the second starts, and the reporter would
    // take the sibling for a suite heading.
    it("unawaited subtests run one after another", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        const order: string[] = []
        local.it("parent", async (t) => {
            void t.test("slow", async () => {
                order.push("slow start")
                await new Promise(r => setTimeout(r, 20))
                order.push("slow end")
            })
            void t.test("fast", () => {
                order.push("fast")
            })
        })
        await local.run()

        assert.equal(order.join(" | "), ["slow start", "slow end", "fast"].join(" | "))
        assert.equal(names(events, "test:start").join(" | "), ["parent", "slow", "fast"].join(" | "))
    })

    // node:test keeps the skip on the failure event and counts the parent as
    // skipped; only the child adds to fail.
    it("a runtime skip outranks a failing subtest in the count", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", async (t) => {
            t.skip("why")
            await t.test("c", () => {
                throw new Error("child failed")
            })
        })
        const summary = await local.run()

        const parent = ofType(events, "test:fail").find(e => e.data.name === "parent")?.data
        assert.equal(parent?.skip, "why")
        assert.equal((parent?.details.error as {failureType?: string}).failureType, "subtestsFailed")
        assert.equal(JSON.stringify(summary.counts), JSON.stringify({tests: 2, suites: 0, passed: 0, failed: 1, cancelled: 0, skipped: 1}))
        assert.equal(summary.success, false)
    })

    it("subtests are numbered within their parent", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", async (t) => {
            await t.test("c1", () => undefined)
            await t.test("c2", () => undefined)
        })
        await local.run()

        const numbered = ofType(events, "test:pass").map(e => `${e.data.name}#${e.data.testNumber}`)
        assert.equal(numbered.join(" | "), ["c1#1", "c2#2", "parent#1"].join(" | "))
    })
})
