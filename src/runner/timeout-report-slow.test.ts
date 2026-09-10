import {strict as assert} from "node:assert"
import {it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"
import {describeSlow, slow} from "./../test-utils/slow.ts"

const TITLE = "runner/timeout-report-slow.test.ts"

// Cancellation racing a slow reporter: a child that settles, skips or is
// declared while an earlier cancellation is still being reported. Every
// case waits on real time, so the suite runs only with TAL_SLOW_TESTS set.

// Every test builds its own harness, so the default one stays clean and
// nothing re-enters when TAL is itself the runner.
describeSlow(TITLE, () => {
    // A child that settled on its own but is still reporting when the
    // parent throws is waited for: its results come before the parent's
    // and are in the counts, however slow the reporter is.
    it("a parent that throws waits for a settled child still reporting", async () => {
        const local = createTAL()
        const events: ReturnType<typeof capture> = []
        local.reporter.format(async function* (source) {
            for await (const event of source) {
                events.push(event)
                yield "."
            }
        })
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        local.it("parent", async (t) => {
            void t.test("child", {timeout: slow(10)}, async (inner) => {
                void inner.test("grandchild", async () => {
                    await new Promise(r => setTimeout(r, slow(100)))
                })
                await new Promise(r => setTimeout(r, slow(100)))
            })
            await new Promise(r => setTimeout(r, slow(40)))
            throw new Error("boom")
        })
        const summary = await local.run()

        assert.deepEqual(names(events, "test:fail"), ["grandchild", "child", "parent"])
        assert.equal(summary.counts.tests, 3)
        assert.equal(events.at(-1)?.type, "test:summary")
    })

    // A child the parent closed may see its own body settle while the
    // parent is still reporting its descendants. The parent reports it in
    // its turn; the child must not report itself in the meantime.
    it("a cancelled child settling during its parent's report stays silent", async () => {
        const local = createTAL()
        const events: ReturnType<typeof capture> = []
        local.reporter.format(async function* (source) {
            for await (const event of source) {
                events.push(event)
                yield "."
            }
        })
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("child", async (inner) => {
                void inner.test("g1", async () => {
                    await new Promise(r => setTimeout(r, slow(100)))
                })
                void inner.test("g2", () => undefined)
                await new Promise(r => setTimeout(r, slow(30)))
            })
            await new Promise(r => setTimeout(r, slow(200)))
        })
        const summary = await local.run()

        assert.deepEqual(names(events, "test:start"), ["parent", "child", "g1", "g2"])
        assert.deepEqual(names(events, "test:fail"), ["g1", "g2", "child", "parent"])
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 0, failed: 0, cancelled: 4, skipped: 0, todo: 0})
    })

    // The same, one level down: a grandchild that passed but is still
    // reporting when the parent throws comes out before the child it
    // belongs to, and before the parent.
    it("a parent that throws waits for a settled grandchild still reporting", async () => {
        const local = createTAL()
        const events: ReturnType<typeof capture> = []
        local.reporter.format(async function* (source) {
            for await (const event of source) {
                events.push(event)
                yield "."
            }
        })
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        local.it("parent", async (t) => {
            void t.test("child", async (inner) => {
                void inner.test("grandchild", () => undefined)
                await new Promise(r => setTimeout(r, slow(100)))
            })
            await new Promise(r => setTimeout(r, slow(20)))
            throw new Error("boom")
        })
        const summary = await local.run()

        assert.deepEqual(names(events, "test:start"), ["parent", "child", "grandchild"])
        const results = events.filter(e => e.type === "test:pass" || e.type === "test:fail").map(e => e.data.name)
        assert.deepEqual(results, ["grandchild", "child", "parent"])
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 1, cancelled: 1, skipped: 0, todo: 0})
        assert.equal(events.at(-1)?.type, "test:summary")
    })

    // A queued sibling keeps its skip when the parent gives up, and every
    // sibling is cancelled even while the reporter's output is slow.
    // With an in-flight child, cancelling it takes several slow reporter
    // calls. A t.test() the body calls while that is still going on must be
    // treated as late, not as an ordinary nested subtest.
    it("a t.test() during a slow cancellation report is treated as late", async () => {
        const local = createTAL()
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        let ran = false
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("in flight", async () => {
                await new Promise(r => setTimeout(r, slow(40)))
            })
            await new Promise(r => setTimeout(r, slow(20)))
            await t.test("during cancellation", () => {
                ran = true
            })
        })
        const summary = await local.run()

        assert.equal(ran, true)
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 1, cancelled: 2, skipped: 0, todo: 0})
    })

    // A skip/bodyless child decides its own verdict synchronously, but the
    // reporter calls that announce it are slow, giving the parent's timeout
    // a window to see it as still unreported and cancel it a second time.
    it("a skipped child settling during a slow report is not double counted", async () => {
        const local = createTAL()
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("quick skip", {skip: "why"}, () => undefined)
            await new Promise(r => setTimeout(r, slow(40)))
        })
        const summary = await local.run()

        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1, todo: 0})
    })

    // A skip the timed-out body calls on itself, after the verdict is
    // already decided, must not turn a cancelled test into a skipped one.
    it("a skip call after the timeout does not reopen the verdict", async () => {
        const local = createTAL()
        // Slow, so the read below waits behind cancelChildren's reporter
        // calls, giving the body time to call skip() before that read.
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("child", async () => {
                await new Promise(r => setTimeout(r, slow(40)))
            })
            await new Promise(r => setTimeout(r, slow(20)))
            t.skip("too late")
            await new Promise(r => setTimeout(r, slow(100)))
        })
        const summary = await local.run()

        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 2, skipped: 0, todo: 0})
    })

    // Marking every child reported happens before any reporter call, not one
    // at a time between them, so a queued sibling cannot start and run while
    // an earlier one's cancellation is still being reported.
    it("a queued sibling does not run while an earlier cancellation is reported", async () => {
        const local = createTAL()
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        let ran = false
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("in flight", async () => {
                await new Promise(r => setTimeout(r, slow(15)))
            })
            void t.test("queued", () => {
                ran = true
            })
            await new Promise(r => setTimeout(r, slow(100)))
        })
        const summary = await local.run()

        assert.equal(ran, false)
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 0, cancelled: 3, skipped: 0, todo: 0})
    })

    it("a parent's timeout cancels the queued subtests, skip kept", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        // Slow output, so children settle while the cancellation is being reported.
        local.reporter.output(() => new Promise(r => setTimeout(r, slow(30))))
        let ran = 0
        local.it("parent", {timeout: slow(10)}, async (t) => {
            void t.test("running", async () => {
                await new Promise(r => setTimeout(r, slow(40)))
            })
            void t.test("queued skip", {skip: "why"}, () => {
                ran++
            })
            void t.test("queued plain", () => {
                ran++
            })
            await new Promise(r => setTimeout(r, slow(100)))
        })
        const summary = await local.run()

        assert.equal(ran, 0)
        const fails = ofType(events, "test:fail").map(e => `${e.data.name}${e.data.skip != null ? " skip=" + String(e.data.skip) : ""}`)
        assert.deepEqual(fails, ["running", "queued skip skip=why", "queued plain", "parent"])
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 0, failed: 0, cancelled: 3, skipped: 1, todo: 0})
    })
})
