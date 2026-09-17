import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "../index.ts"
import {capture, names, ofType, summaryOf} from "../test-utils/capture.ts"

const TITLE = "session/scheduler.test.ts"

// end() as a whole: what it counts, in what order it runs and reports, and
// how one harness behaves across calls.

// Every test builds its own harness, so sharedTAL stays clean and
// nothing re-enters when TAL is itself the runner.
describe(TITLE, () => {
    it("runs registered tests and counts them", async () => {
        const local = createTAL()
        const events = capture(local)
        local.it("a", () => undefined)
        local.it("b", () => undefined)
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0})
        assert.equal(summary.success, true)
    })

    it("nothing runs until end() is called", async () => {
        const local = createTAL()
        const events = capture(local)
        let ran = false
        local.it("later", () => {
            ran = true
        })

        assert.equal(ran, false)
        assert.equal(events.length, 0)
        await local.end()
        assert.equal(ran, true)
    })

    // A suite may declare on either side of a top-level await; end() takes
    // both, as node --test does once every file has loaded.
    it("a test declared after an await is run with the earlier ones", async () => {
        const local = createTAL()
        const events = capture(local)
        const order: string[] = []
        local.it("first", () => {
            order.push("first")
        })
        await new Promise(r => setTimeout(r, 0))
        assert.equal(order.length, 0)
        local.it("second", () => {
            order.push("second")
        })
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(order, ["first", "second"])
        assert.deepEqual(names(events, "test:pass"), ["first", "second"])
        assert.equal(summary.counts.tests, 2)
    })

    it("reports a failing test and flips success", async () => {
        const local = createTAL()
        const events = capture(local)
        local.it("bad", () => {
            throw new Error("boom")
        })
        await local.end()
        const summary = summaryOf(events)

        assert.equal(summary.counts.failed, 1)
        assert.equal(summary.counts.passed, 0)
        assert.equal(summary.success, false)
    })

    it("tests run in registration order", async () => {
        const local = createTAL()
        local.session({output: () => undefined})
        const order: string[] = []
        local.it("1", async () => {
            await new Promise(r => setTimeout(r, 20))
            order.push("1")
        })
        local.it("2", () => {
            order.push("2")
        })
        await local.end()

        assert.deepEqual(order, ["1", "2"])
    })

    it("the summary is emitted last, and end() resolves with its verdict", async () => {
        const local = createTAL()
        const events = capture(local)
        local.it("only", () => undefined)
        const result = await local.end()

        const last = events.at(-1)
        assert.equal(last?.type, "test:summary")
        assert.deepEqual(result, {success: true})
    })

    it("the summary diagnostics precede the summary event", async () => {
        const local = createTAL()
        const events = capture(local)
        local.it("one", () => undefined)
        await local.end()

        const messages = events
            .filter(e => e.type === "test:diagnostic")
            .map(e => e.data.message)
        const counts = ["tests 1", "suites 0", "pass 1", "fail 0", "cancelled 0", "skipped 0", "todo 0"]
        assert.deepEqual(messages.slice(0, counts.length), counts)
        assert.ok(messages.some(message => /^duration_ms \d/.test(String(message))))
    })

    it("the summary names this package, after the counts and before the summary event", async () => {
        const local = createTAL()
        const events = capture(local)
        local.it("one", () => undefined)
        await local.end()

        const messages = events.filter(e => e.type === "test:diagnostic").map(e => String(e.data.message))
        assert.ok(messages.some(message => /^test-assert-lite \d+\.\d+\.\d+/.test(message)), messages.join(", "))
        const at = events.findIndex(e => e.type === "test:summary")
        assert.ok(at > 0 && events.slice(at + 1).every(e => e.type !== "test:diagnostic"))
    })

    // Registrations are consumed, while reporter settings belong to the harness.
    it("end() resets the registry", async () => {
        const local = createTAL()
        const first = capture(local)
        local.it("first", () => undefined)
        await local.end()
        assert.equal(summaryOf(first).counts.tests, 1)

        const second = capture(local)
        await local.end()
        assert.equal(summaryOf(second).counts.tests, 0)
    })

    it("rejects a concurrent end() without running the test twice", async () => {
        const local = createTAL()
        const events = capture(local)
        let release!: () => void
        const waiting = new Promise<void>(resolve => {
            release = resolve
        })
        let executions = 0
        local.it("slow", async () => {
            executions++
            await waiting
        })

        const first = local.end()
        const secondError = await (async () => {
            try {
                await local.end()
                return undefined
            } catch (error) {
                return error
            }
        })()
        release()
        await first

        assert.match(String(secondError), /already running/)
        assert.equal(executions, 1)
        assert.equal(summaryOf(events).counts.tests, 1)
    })

    it("an anonymous test falls back to the function name", async () => {
        const local = createTAL()
        const events = capture(local)
        local.it(function namedFn() {
            // With no name the function name is used, as in node:test.
        })
        local.it(() => undefined)
        await local.end()

        assert.deepEqual(names(events, "test:pass"), ["namedFn", "<anonymous>"])
    })

    // An Error is reported as thrown so its own fields stay reachable;
    // anything else is wrapped so that details.error is always an Error.
    it("a thrown Error passes through and a thrown value is wrapped", async () => {
        const local = createTAL()
        const events = capture(local)
        const thrown = new RangeError("as is")
        local.it("error", () => {
            throw thrown
        })
        local.it("string", () => {
            throw "just text"
        })
        await local.end()

        const [first, second] = ofType(events, "test:fail").map(e => e.data.details.error as Error & {cause?: unknown, failureType?: string})
        assert.equal(first, thrown)
        assert.equal(second?.name, "TesterError")
        assert.equal(second?.failureType, "testCodeFailure")
        assert.equal(second?.message, "just text")
        assert.equal(second?.cause, "just text")
    })
})
