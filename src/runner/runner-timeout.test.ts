import {strict as assert} from "node:assert"
import {it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"
import {describeSlow, slow} from "./../test-utils/slow.ts"

const TITLE = "runner/runner-timeout.test.ts"

// Timeouts and everything that happens after one: cancelling the subtests
// in flight, what a body may still do, and when the run ends. Every case
// waits on real time, so the suite runs only with TAL_SLOW_TESTS set.

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

    // node:test reports the timeout at once and, as long as the process is
    // kept alive, ends the run only when the body has settled. A library
    // cannot see what keeps a process alive, so the body is given one more
    // timeout's worth of time, and what it does meanwhile stays in the run.
    it("run() waits for a timed out body to settle within one more timeout", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let settled = false
        local.it("slow", {timeout: slow(30)}, async () => {
            await new Promise(r => setTimeout(r, slow(40)))
            settled = true
        })
        const summary = await local.run()

        assert.equal(settled, true)
        assert.deepEqual(summary.counts, {tests: 1, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 0})
    })

    // Past that, the run ends: a body that never settles cannot hold it
    // open, and what a body does after the run has ended is dropped.
    it("run() does not wait for a timed out body beyond that, and drops what it does after", async () => {
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
        assert.deepEqual(summary.counts, {tests: 1, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 0})

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

    // node:test still runs the body, then files the subtest as a failure of
    // its own kind at the top level, awaited or not.
    it("a subtest after the timeout is counted as parentAlreadyFinished", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let ran = 0
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late awaited", () => {
                ran++
            })
            void t.test("late unawaited", () => {
                ran++
            })
        })
        const summary = await local.run()

        assert.equal(ran, 2)
        const late = ofType(events, "test:fail").filter(e => e.data.name.startsWith("late"))
        assert.deepEqual(late.map(e => `${e.data.name}@${e.data.nesting}#${e.data.testNumber}`), ["late awaited@0#2", "late unawaited@0#3"])
        assert.equal((late[0]?.data.details.error as {failureType?: string}).failureType, "parentAlreadyFinished")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 2, cancelled: 1, skipped: 0})
        assert.equal(summary.success, false)
    })

    // node:test reports a child still in flight as cancelled the moment its
    // parent times out, ahead of the parent, and ignores the child's own
    // verdict when its body settles later.
    it("a parent's timeout cancels the subtest still running", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let childSettled = false
        local.it("parent", {timeout: slow(30)}, async (t) => {
            void t.test("child", async () => {
                await new Promise(r => setTimeout(r, slow(40)))
                childSettled = true
            })
            await new Promise(r => setTimeout(r, slow(50)))
        })
        local.it("next", () => undefined)
        const summary = await local.run()

        assert.equal(childSettled, true)
        const results = events
            .filter(e => e.type === "test:pass" || e.type === "test:fail")
            .map(e => `${e.data.name}@${e.data.nesting}#${e.data.testNumber}`)
        assert.deepEqual(results, ["child@1#1", "parent@0#1", "next@0#2"])
        const child = ofType(events, "test:fail").find(e => e.data.name === "child")?.data
        assert.equal((child?.details.error as {failureType?: string}).failureType, "cancelledByParent")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 0, cancelled: 2, skipped: 0})
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
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 2, skipped: 0})
    })

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
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 0, failed: 0, cancelled: 4, skipped: 0})
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
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 1, cancelled: 1, skipped: 0})
        assert.equal(events.at(-1)?.type, "test:summary")
    })

    // The root's after hooks run once the registered tests are done, not
    // once a timed out body has settled: teardown must not wait on it. What
    // that body declares afterwards runs after the teardown.
    it("root after hooks run before a timed out body is waited for", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.after(() => {
            order.push("after")
        })
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            order.push("settled")
            await t.test("late", () => {
                order.push("late")
            })
        })
        await local.run()

        assert.deepEqual(order, ["after", "settled", "late"])
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
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 1, cancelled: 2, skipped: 0})
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

        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1})
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

        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 2, skipped: 0})
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
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1})
    })

    // A late subtest's own t.skip() decides its verdict too, even though
    // node.options carried no skip when it was declared.
    it("a late subtest's own skip is honored", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", (t2) => {
                t2.skip("why")
            })
        })
        const summary = await local.run()

        const late = ofType(events, "test:fail").find(e => e.data.name === "late")?.data
        assert.equal(late?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1})
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
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 0, cancelled: 3, skipped: 0})
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
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 0, failed: 0, cancelled: 3, skipped: 1})
    })

    // What a late subtest starts and does not await settles before the summary too.
    it("a late subtest's unawaited subtest settles before the summary", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let settled = false
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", (inner) => {
                void inner.test("grandchild", async () => {
                    await new Promise(r => setTimeout(r, slow(40)))
                    settled = true
                })
            })
        })
        const summary = await local.run()

        assert.equal(settled, true)
        assert.equal(summary.counts.tests, 3)
    })

    // node:test announces a late subtest as an ancestor before running its
    // own body, so a subtest it starts announces the late test first.
    it("a late subtest announces itself before its own subtest", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", async (inner) => {
                await inner.test("grandchild", () => undefined)
            })
        })
        await local.run()

        assert.deepEqual(names(events, "test:start"), ["slow", "late", "grandchild"])
    })

    // A late subtest's own timeout is honored the same way a registered
    // test's is: node:test does not wait for the body, and cancels whatever
    // subtest it had already started.
    it("a late subtest's own timeout does not wait for its body or its subtest", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        const order: string[] = []
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", {timeout: slow(60)}, async (inner) => {
                void inner.test("grandchild", async () => {
                    await new Promise(r => setTimeout(r, slow(100)))
                })
                await new Promise(r => setTimeout(r, slow(100)))
                order.push("late body settled")
            })
            order.push("released")
            await t.test("late2", () => undefined)
        })
        await local.run()

        assert.deepEqual(order, ["released", "late body settled"])
        const grandchild = ofType(events, "test:fail").find(e => e.data.name === "grandchild")?.data
        assert.equal((grandchild?.details.error as {failureType?: string}).failureType, "cancelledByParent")
    })

    // A late subtest is filed as parentAlreadyFinished no matter how its own
    // body ended, throwing synchronously included.
    it("a late subtest that throws synchronously is still counted and reported", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", () => {
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        const late = ofType(events, "test:fail").find(e => e.data.name === "late")?.data
        assert.equal((late?.details.error as {failureType?: string}).failureType, "parentAlreadyFinished")
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 1, cancelled: 1, skipped: 0})
    })

    // A skip the body calls before its own timeout cuts it off still decides
    // the verdict, the same as a registered test's does.
    it("a late subtest's own skip survives its own timeout", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", {timeout: slow(10)}, async (inner) => {
                inner.skip("why")
                await new Promise(r => setTimeout(r, slow(100)))
            })
        })
        const summary = await local.run()

        const late = ofType(events, "test:fail").find(e => e.data.name === "late")?.data
        assert.equal(late?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1})
    })

    // node:test does not run a skipped late subtest, keeps its skip on the
    // failure event, and counts it as skipped.
    it("a skipped subtest after the timeout stays skipped", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let ran = false
        local.it("slow", {timeout: slow(30)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late skip", {skip: "why"}, () => {
                ran = true
            })
        })
        const summary = await local.run()

        assert.equal(ran, false)
        const late = ofType(events, "test:fail").find(e => e.data.name === "late skip")?.data
        assert.equal(late?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 1, skipped: 1})
    })

    // node:test reports a late subtest after every registered test, numbered
    // as the root's next child, so a test still to run keeps its own number.
    it("a late subtest is reported after the registered tests", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("slow", {timeout: slow(10)}, async (t) => {
            await new Promise(r => setTimeout(r, slow(40)))
            await t.test("late", () => undefined)
        })
        local.it("second", async () => {
            await new Promise(r => setTimeout(r, slow(80)))
        })
        local.it("third", () => undefined)
        await local.run()

        const results = events
            .filter(e => e.type === "test:pass" || e.type === "test:fail")
            .map(e => `${e.data.name}#${e.data.testNumber}`)
        assert.deepEqual(results, ["slow#1", "second#2", "third#3", "late#4"])
    })
})
