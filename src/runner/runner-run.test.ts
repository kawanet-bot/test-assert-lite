import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture} from "./../test-utils/capture.ts"

const TITLE = "runner/runner-run.test.ts"

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

        assert.equal(summary.counts.tests, 2)
        assert.equal(summary.counts.passed, 2)
        assert.equal(summary.counts.failed, 0)
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
        assert.deepEqual(messages, [
            "tests 1", "suites 0", "pass 1", "fail 0", "cancelled 0", "skipped 0",
            messages.at(-1),
        ])
        assert.ok(String(messages.at(-1)).startsWith("duration_ms "))
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
})
