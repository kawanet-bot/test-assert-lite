import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"

const TITLE = "runner/runner-subtest.test.ts"

// The test context: t.test(), t.skip(), t.diagnostic(), t.assert, and how a
// subtest's verdict reaches its parent.

// Every test builds its own harness, so the default one stays clean and
// nothing re-enters when TAL is itself the runner.
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

        assert.deepEqual(order, ["parent start", "child", "parent end"])
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

        assert.deepEqual(order, ["parent body", "child"])
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

        assert.deepEqual(names(events, "test:pass"), ["namedFn", "<anonymous>"])
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
        assert.equal(second?.name, "TesterError")
        assert.equal(second?.failureType, "testCodeFailure")
        assert.equal(second?.message, "just text")
        assert.equal(second?.cause, "just text")
    })

    // node:test starts the body inside t.test(), so it reaches its first
    // await before the parent's next statement runs.
    it("the first subtest starts before t.test() returns", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.it("parent", async (t) => {
            const pending = t.test("child", () => {
                order.push("child body")
            })
            order.push("after call")
            await pending
        })
        await local.run()

        assert.deepEqual(order, ["child body", "after call"])
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

        assert.deepEqual(order, ["slow start", "slow end", "fast"])
        assert.deepEqual(names(events, "test:start"), ["parent", "slow", "fast"])
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
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 1, cancelled: 0, skipped: 1})
        assert.equal(summary.success, false)
    })

    // node:test closes the subtests still open when the parent's body
    // throws, the same way it does at a timeout: the one running is reported
    // as cancelledByParent ahead of the parent, and its own verdict, when
    // its body settles later, goes nowhere.
    it("a parent that throws cancels the subtest still running", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let settled = false
        local.it("parent", async (t) => {
            void t.test("child", async () => {
                await new Promise(r => setTimeout(r, 20))
                settled = true
            })
            throw new Error("boom")
        })
        local.it("next", () => undefined)
        const summary = await local.run()

        const results = events
            .filter(e => e.type === "test:pass" || e.type === "test:fail")
            .map(e => `${e.data.name}@${e.data.nesting}#${e.data.testNumber}`)
        assert.deepEqual(results, ["child@1#1", "parent@0#1", "next@0#2"])
        const child = ofType(events, "test:fail").find(e => e.data.name === "child")?.data
        assert.equal((child?.details.error as {failureType?: string}).failureType, "cancelledByParent")
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 1, failed: 1, cancelled: 1, skipped: 0})

        await new Promise(r => setTimeout(r, 40))
        assert.equal(settled, true)
        assert.equal(events.at(-1)?.type, "test:summary")
    })

    it("a parent that throws cancels the queued subtests without running them", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let ran = false
        local.it("parent", async (t) => {
            void t.test("running", async () => {
                await new Promise(r => setTimeout(r, 20))
            })
            void t.test("queued", () => {
                ran = true
            })
            throw new Error("boom")
        })
        const summary = await local.run()

        assert.equal(ran, false)
        assert.deepEqual(names(events, "test:fail"), ["running", "queued", "parent"])
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 1, cancelled: 2, skipped: 0})
    })

    // A cancelled child that keeps running is finished as far as the run is
    // concerned, so a subtest it declares afterwards goes to the root and
    // fails as parentAlreadyFinished, as node:test files it.
    it("a subtest declared by a cancelled child goes to the root", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", async (t) => {
            void t.test("child", async (inner) => {
                await new Promise(r => setTimeout(r, 20))
                void inner.test("grandchild", () => undefined)
            })
            throw new Error("boom")
        })
        local.it("keep", async () => {
            await new Promise(r => setTimeout(r, 60))
        })
        const summary = await local.run()

        const grandchild = ofType(events, "test:fail").find(e => e.data.name === "grandchild")?.data
        assert.equal(grandchild?.nesting, 0)
        assert.equal(grandchild?.testNumber, 3)
        assert.equal((grandchild?.details.error as {failureType?: string}).failureType, "parentAlreadyFinished")
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 1, failed: 2, cancelled: 1, skipped: 0})
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
        assert.deepEqual(numbered, ["c1#1", "c2#2", "parent#1"])
    })
})
