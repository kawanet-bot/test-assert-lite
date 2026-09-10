import {strict as assert} from "node:assert"
import {it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"
import {describeSlow, slow} from "./../test-utils/slow.ts"

const TITLE = "runner/timeout-slow.test.ts"

// A test's own timeout: the verdict it decides, what the body may still
// do afterwards, and what a parent's timeout does to its subtests. Every
// case waits on real time, so the suite runs only with TAL_SLOW_TESTS set.

// Every test builds its own harness, so the default one stays clean and
// nothing re-enters when TAL is itself the runner.
describeSlow(TITLE, () => {
    // node:test files a timeout under cancelled, not failed.
    it("timeout option cancels the test", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(10)}, async () => {
            await new Promise(r => setTimeout(r, slow(200)))
        })
        const summary = await local.run()

        assert.equal(summary.counts.cancelled, 1)
        assert.equal(summary.counts.failed, 0)
        assert.equal(summary.success, false)
        const error = ofType(events, "test:fail")[0]?.data.details.error as Error & {code?: string, failureType?: string}
        assert.equal(error?.name, "TesterError")
        assert.equal(error?.code, "ERR_TEST_FAILURE")
        assert.equal(error?.failureType, "testTimeoutFailure")
        assert.equal(error?.message, `test timed out after ${slow(10)}ms`)
    })

    // The child is filed under cancelled, the parent under failed.
    it("a timed out subtest fails the parent", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("parent", async (t) => {
            await t.test("slow child", {timeout: slow(10)}, async () => {
                await new Promise(r => setTimeout(r, slow(200)))
            })
        })
        const summary = await local.run()

        assert.equal(summary.counts.cancelled, 1)
        assert.equal(summary.counts.failed, 1)
    })

    // node:test reports a child still in flight as cancelled the moment its
    // parent times out, ahead of the parent. The child's body is not
    // waited for, and its own verdict, when it settles, goes nowhere.
    it("a parent's timeout cancels the subtest still running", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("child", async () => {
                await new Promise(r => setTimeout(r, slow(40)))
            })
            await new Promise(r => setTimeout(r, slow(50)))
        })
        local.it("next", () => undefined)
        const summary = await local.run()

        const results = events
            .filter(e => e.type === "test:pass" || e.type === "test:fail")
            .map(e => `${e.data.name}@${e.data.nesting}#${e.data.testNumber}`)
        assert.deepEqual(results, ["child@1#1", "parent@0#1", "next@0#2"])
        const child = ofType(events, "test:fail").find(e => e.data.name === "child")?.data
        assert.equal((child?.details.error as {failureType?: string}).failureType, "cancelledByParent")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 0, cancelled: 2, skipped: 0, todo: 0})
    })

    // A child's own timer may fire after its parent already gave up on it.
    // The parent's verdict stands; the child does not report a second time.
    it("a child's own timeout after its parent's does not report it again", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("child", {timeout: slow(30)}, async () => {
                await new Promise(r => setTimeout(r, slow(100)))
            })
            await new Promise(r => setTimeout(r, slow(100)))
        })
        const summary = await local.run()

        assert.deepEqual(names(events, "test:fail"), ["child", "parent"])
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 2, skipped: 0, todo: 0})
    })

    // A running child's own t.skip() decides how its parent's cancellation
    // reports it, not the options it was declared with.
    it("a running child's own skip is kept when its parent times out", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("child", async (t2) => {
                t2.skip("why")
                await new Promise(r => setTimeout(r, slow(40)))
            })
            await new Promise(r => setTimeout(r, slow(100)))
        })
        const summary = await local.run()

        const child = ofType(events, "test:fail").find(e => e.data.name === "child")?.data
        assert.equal(child?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1, todo: 0})
    })

    // node:test ends its run only when nothing keeps the process alive,
    // which a library cannot see. The timeout is the verdict, and the run
    // does not wait on the body: one that never settles cannot hold it open.
    it("run() does not wait for a timed out body", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let settled = false
        local.it("slow", {timeout: slow(10)}, async () => {
            await new Promise(r => setTimeout(r, slow(40)))
            settled = true
        })
        const summary = await local.run()

        assert.equal(settled, false)
        assert.deepEqual(summary.counts, {tests: 1, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 0, todo: 0})
    })

    // What a body does after the run has ended is dropped.
    it("what a timed out body does after the run has ended is dropped", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let settled = false
        local.it("slow", {timeout: slow(10)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(60)))
            settled = true
            t.diagnostic("late")
            void t.test("late", () => undefined)
        })
        const summary = await local.run()
        assert.equal(settled, false)
        assert.deepEqual(summary.counts, {tests: 1, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 0, todo: 0})

        await new Promise(r => setTimeout(r, slow(80)))
        assert.equal(settled, true)
        assert.equal(ofType(events, "test:diagnostic").some(e => e.data.message === "late"), false)
        assert.deepEqual(names(events, "test:start"), ["slow"])
    })

    it("a diagnostic after the timeout is dropped", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(10)}, async (t) => {
            t.diagnostic("in time")
            await new Promise(r => setTimeout(r, slow(40)))
            t.diagnostic("late")
        })
        await local.run()

        const messages = ofType(events, "test:diagnostic").map(e => e.data.message)
        assert.ok(messages.includes("in time"))
        assert.equal(messages.includes("late"), false)
    })

    // The root's after hooks run once the registered tests are done, and
    // the run ends there: a timed out body is not waited for, and what it
    // declares once the run has ended is dropped rather than run.
    it("root after hooks run without waiting for a timed out body", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.after(() => {
            order.push("after")
        })
        local.it("slow", {timeout: slow(10)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            order.push("settled")
            await t.test("late", () => {
                order.push("late")
            })
            order.push("resumed")
        })
        await local.run()
        assert.deepEqual(order, ["after"])

        await new Promise(r => setTimeout(r, slow(80)))
        assert.deepEqual(order, ["after", "settled", "resumed"])
    })

    // The declaration API is closed while a body is open, and a body that
    // outlived its timeout is still open: what it declares must not land
    // in the next run.
    it("the declaration API stays rejected after the test timed out", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let caught: string | undefined
        local.it("slow", {timeout: slow(10)}, async () => {
            await new Promise(r => setTimeout(r, slow(40)))
            try {
                local.it("stray", () => undefined)
            } catch (e) {
                caught = (e as Error).message
            }
        })
        await local.run()
        await new Promise(r => setTimeout(r, slow(60)))

        assert.equal(caught, "it() cannot be called from inside a test body; use t.test() instead")
        local.reporter.output(() => undefined)
        const second = await local.run()
        assert.equal(second.counts.tests, 0)
    })

    // A suite body runs when the walk reaches it, which may be while an
    // earlier test's body is still open past its timeout. Its declarations
    // are the suite's own and must be taken.
    it("a suite after a timed out test still declares its tests", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("slow", {timeout: slow(10)}, async () => {
            await new Promise(r => setTimeout(r, slow(60)))
        })
        local.describe("S", () => {
            local.it("a", () => undefined)
            local.it("b", () => undefined)
        })
        const summary = await local.run()

        assert.deepEqual(summary.counts, {tests: 3, suites: 1, passed: 2, failed: 0, cancelled: 1, skipped: 0, todo: 0})
    })
})
