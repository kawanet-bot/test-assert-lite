import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"

const TITLE = "runner/run.test.ts"

// run() as a whole: what it counts, in what order it runs and reports, and
// how one harness behaves across calls.

// Every test builds its own harness, so the default one stays clean and
// nothing re-enters when TAL is itself the runner.
describe(TITLE, () => {
    it("runs registered tests and counts them", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("a", () => undefined)
        local.it("b", () => undefined)
        const summary = await local.run()

        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 2, failed: 0, cancelled: 0, skipped: 0, todo: 0})
        assert.equal(summary.success, true)
    })

    it("nothing runs until run() is called", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let ran = false
        local.it("later", () => {
            ran = true
        })

        assert.equal(ran, false)
        assert.equal(events.length, 0)
        await local.run()
        assert.equal(ran, true)
    })

    it("reports a failing test and flips success", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("bad", () => {
            throw new Error("boom")
        })
        const summary = await local.run()

        assert.equal(summary.counts.failed, 1)
        assert.equal(summary.counts.passed, 0)
        assert.equal(summary.success, false)
    })

    it("tests run in registration order", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.it("1", async () => {
            await new Promise(r => setTimeout(r, 20))
            order.push("1")
        })
        local.it("2", () => {
            order.push("2")
        })
        await local.run()

        assert.deepEqual(order, ["1", "2"])
    })

    it("summary is emitted last and matches the return value", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("only", () => undefined)
        const summary = await local.run()

        const last = events.at(-1)
        assert.equal(last?.type, "test:summary")
        assert.deepEqual(last?.data, summary)
    })

    // The caller can read tests to tell an empty run from a successful one.
    it("an empty run resolves with zero counts", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const summary = await local.run()

        assert.equal(summary.counts.tests, 0)
        assert.equal(summary.success, true)
    })

    it("the summary diagnostics precede the summary event", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("one", () => undefined)
        await local.run()

        const messages = events
            .filter(e => e.type === "test:diagnostic")
            .map(e => e.data.message)
        const counts = ["tests 1", "suites 0", "pass 1", "fail 0", "cancelled 0", "skipped 0", "todo 0"]
        assert.deepEqual(messages.slice(0, counts.length), counts)
        assert.ok(messages.some(message => /^duration_ms \d/.test(String(message))))
    })

    it("the summary names this package and the user agent it ran under", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("one", () => undefined)
        await local.run()

        const messages = events.filter(e => e.type === "test:diagnostic").map(e => String(e.data.message))
        assert.ok(messages.some(message => /^test-assert-lite \d+\.\d+\.\d+/.test(message)), messages.join(", "))
        assert.ok(messages.some(message => /^user-agent \S/.test(message)), messages.join(", "))
        const at = events.findIndex(e => e.type === "test:summary")
        assert.ok(at > 0 && events.slice(at + 1).every(e => e.type !== "test:diagnostic"))
    })

    // Registrations are consumed, while reporter settings belong to the harness.
    it("run() resets the registry", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("first", () => undefined)
        const first = await local.run()
        assert.equal(first.counts.tests, 1)

        local.reporter.output(() => undefined)
        const second = await local.run()
        assert.equal(second.counts.tests, 0)
    })

    it("rejects a concurrent run without running the test twice", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let release!: () => void
        const waiting = new Promise<void>(resolve => {
            release = resolve
        })
        let executions = 0
        local.it("slow", async () => {
            executions++
            await waiting
        })

        const first = local.run()
        const secondError = await (async () => {
            try {
                await local.run()
                return undefined
            } catch (error) {
                return error
            }
        })()
        release()
        const summary = await first

        assert.match(String(secondError), /already running/)
        assert.equal(executions, 1)
        assert.equal(summary.counts.tests, 1)
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
})
