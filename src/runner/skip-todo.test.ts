import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"

const TITLE = "runner/skip-todo.test.ts"

// skip and todo: as an option, as it.skip(), and as t.skip() / t.todo()
// from the body; which of the two wins, and how a subtest inherits them.

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
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 1, cancelled: 0, skipped: 1, todo: 0})
        assert.equal(summary.success, false)
    })

    // node:test runs a todo, reports it, and counts it as todo whatever the
    // verdict; a failing todo does not fail the run.
    it("todo option runs the test and counts it as todo", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        let ran = 0
        local.it("bare", {todo: true}, () => {
            ran++
        })
        local.it("reason", {todo: "later"}, () => {
            ran++
        })
        local.it("broken", {todo: true}, () => {
            throw new Error("boom")
        })
        const summary = await local.run()

        assert.equal(ran, 2)
        const results = events.filter(e => e.type === "test:pass" || e.type === "test:fail")
        assert.deepEqual(results.map(e => `${e.type}:${e.data.name}:${String(e.data.todo)}`), [
            "test:pass:bare:true", "test:pass:reason:later", "test:fail:broken:true",
        ])
        assert.deepEqual(summary.counts, {tests: 3, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 3})
        assert.equal(summary.success, true)
    })

    it("t.todo() marks the test from the body", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("later", (t) => {
            t.todo("later")
        })
        local.it("it.todo", () => undefined)
        const summary = await local.run()

        const later = ofType(events, "test:pass").find(e => e.data.name === "later")?.data
        assert.equal(later?.todo, "later")
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 1})
    })

    // A result carries skip or todo, never both, and the count follows the skip.
    it("a skip outranks a todo", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("declared", {skip: true, todo: true}, () => undefined)
        local.it("called", (t) => {
            t.todo("t")
            t.skip("s")
        })
        const summary = await local.run()

        const passes = ofType(events, "test:pass").map(e => `${e.data.name}:${String(e.data.skip)}:${String(e.data.todo)}`)
        assert.deepEqual(passes, ["declared:true:undefined", "called:s:undefined"])
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 2, todo: 0})
    })

    // node:test marks a todo's subtests todo as well, and a todo subtest
    // that fails does not fail its parent.
    it("subtests inherit todo, and a failing todo subtest does not fail its parent", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", {todo: true}, async (t) => {
            await t.test("child", () => {
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        const child = ofType(events, "test:fail").find(e => e.data.name === "child")?.data
        assert.equal(child?.todo, true)
        const parent = ofType(events, "test:pass").find(e => e.data.name === "parent")?.data
        assert.equal(parent?.todo, true)
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 2})
        assert.equal(summary.success, true)
    })

    // A skip hides the todo mark and takes the count, but the todo behind it
    // still keeps the failure from the run and the parent, as in node:test.
    it("a todo that skips and then fails still does not fail the run or its parent", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.it("parent", {todo: true}, async (t) => {
            await t.test("child", (inner) => {
                inner.skip("why")
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        const child = ofType(events, "test:fail").find(e => e.data.name === "child")?.data
        assert.equal(child?.skip, "why")
        assert.equal(child?.todo, undefined)
        assert.equal(names(events, "test:pass").includes("parent"), true)
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 1, todo: 1})
        assert.equal(summary.success, true)
    })
})
