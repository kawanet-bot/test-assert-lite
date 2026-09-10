import {strict as assert} from "node:assert"
import {it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"
import {describeSlow, slow} from "./../test-utils/slow.ts"

const TITLE = "runner/timeout-late-slow.test.ts"

// Late subtests: what a body declares after its timeout goes to the root
// as parentAlreadyFinished, numbered, skipped or timed out on its own. Every
// case waits on real time, so the suite runs only with TAL_SLOW_TESTS set.

// Every test builds its own harness, so the default one stays clean and
// nothing re-enters when TAL is itself the runner.
describeSlow(TITLE, () => {
    // Keeps the run open past a timed out body, as something else still
    // running does in node:test, so what that body declares meanwhile is
    // taken. The run does not wait on such a body on its own.
    const keepOpen = (local: ReturnType<typeof createTAL>): void => {
        local.it("keep", async () => {
            await new Promise(r => setTimeout(r, slow(60)))
        })
    }

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
        keepOpen(local)
        const summary = await local.run()

        assert.equal(ran, 2)
        const late = ofType(events, "test:fail").filter(e => e.data.name.startsWith("late"))
        assert.deepEqual(late.map(e => `${e.data.name}@${e.data.nesting}#${e.data.testNumber}`), ["late awaited@0#3", "late unawaited@0#4"])
        assert.equal((late[0]?.data.details.error as {failureType?: string}).failureType, "parentAlreadyFinished")
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 1, failed: 2, cancelled: 1, skipped: 0, todo: 0})
        assert.equal(summary.success, false)
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
        keepOpen(local)
        const summary = await local.run()

        const late = ofType(events, "test:fail").find(e => e.data.name === "late")?.data
        assert.equal(late?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 0, cancelled: 1, skipped: 1, todo: 0})
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
        keepOpen(local)
        const summary = await local.run()

        assert.equal(settled, true)
        assert.equal(summary.counts.tests, 4)
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
        keepOpen(local)
        await local.run()

        assert.deepEqual(names(events, "test:start"), ["slow", "keep", "late", "grandchild"])
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
        keepOpen(local)
        await local.run()

        assert.deepEqual(order, ["released"])
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
        keepOpen(local)
        const summary = await local.run()

        const late = ofType(events, "test:fail").find(e => e.data.name === "late")?.data
        assert.equal((late?.details.error as {failureType?: string}).failureType, "parentAlreadyFinished")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 1, cancelled: 1, skipped: 0, todo: 0})
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
        keepOpen(local)
        const summary = await local.run()

        const late = ofType(events, "test:fail").find(e => e.data.name === "late")?.data
        assert.equal(late?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 0, cancelled: 1, skipped: 1, todo: 0})
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
        keepOpen(local)
        const summary = await local.run()

        assert.equal(ran, false)
        const late = ofType(events, "test:fail").find(e => e.data.name === "late skip")?.data
        assert.equal(late?.skip, "why")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 0, cancelled: 1, skipped: 1, todo: 0})
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
