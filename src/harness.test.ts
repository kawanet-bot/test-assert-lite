import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {createTAL} from "./index.ts"
import {capture, names} from "./test-utils/capture.ts"

const TITLE = "harness.test.ts"

describe(TITLE, () => {
    it("createTAL returns the bound API", () => {
        const local = createTAL()

        assert.equal(typeof local.suite, "function")
        assert.equal(typeof local.describe, "function")
        assert.equal(typeof local.test, "function")
        assert.equal(typeof local.it, "function")
        assert.equal(typeof local.before, "function")
        assert.equal(typeof local.after, "function")
        assert.equal(typeof local.run, "function")
        assert.equal(typeof local.reporter, "object")
        assert.equal(typeof local.strict, "function")
    })

    it("describe aliases suite and it aliases test", () => {
        const local = createTAL()

        assert.equal(local.describe, local.suite)
        assert.equal(local.it, local.test)
    })

    // Isolation is the whole point of the factory, so hold the line that a
    // test registered on one harness never joins another harness's run().
    it("each harness keeps its own registry", async () => {
        const a = createTAL()
        const b = createTAL()
        a.reporter.output(() => undefined)
        b.reporter.output(() => undefined)

        a.it("only on a", () => undefined)
        b.it("only on b", () => undefined)
        b.it("also on b", () => undefined)

        assert.equal((await b.run()).counts.tests, 2)
        assert.equal((await a.run()).counts.tests, 1)
    })

    it("two harnesses do not share hooks", async () => {
        const a = createTAL()
        const b = createTAL()
        a.reporter.output(() => undefined)
        b.reporter.output(() => undefined)
        const order: string[] = []

        a.before(() => {
            order.push("a:before")
        })
        a.it("a-test", () => {
            order.push("a-test")
        })
        b.it("b-test", () => {
            order.push("b-test")
        })

        await b.run()
        await a.run()

        assert.equal(order.join(" | "), ["b-test", "a:before", "a-test"].join(" | "))
    })

    it("run() resets only its own harness", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        local.it("once", () => undefined)

        assert.equal((await local.run()).counts.tests, 1)

        assert.equal((await local.run()).counts.tests, 0)
    })

    // The reporter belongs to the harness too, so output cannot leak across.
    it("each harness owns its reporter", async () => {
        const a = createTAL()
        const b = createTAL()
        const seenByA = capture(a.reporter)
        const seenByB = capture(b.reporter)

        assert.notEqual(a.reporter, b.reporter)

        b.it("only on b", () => undefined)
        await b.run()

        assert.ok(names(seenByB, "test:pass").includes("only on b"))
        assert.equal(seenByA.length, 0)
    })

    it("output set on one harness does not reach the other", async () => {
        const local = createTAL()
        const lines: string[] = []
        local.reporter.format(local.reporter.spec({colors: false}))
        local.reporter.output(text => {
            lines.push(text)
        })

        local.it("visible", () => undefined)
        await local.run()

        assert.ok(lines.join("").includes("visible"))
    })

    // strict holds no state and needs no per-harness copy, but it rides on
    // TestHarness so that the harness really is the whole set.
    it("each harness gets its own assert surface", () => {
        const a = createTAL()
        const b = createTAL()

        assert.notEqual(a.strict, b.strict)
        assert.equal(typeof a.strict.equal, "function")
        a.strict.equal(1, 1)
        assert.throws(() => b.strict.equal(1, 2), /expected 2, got 1/)
    })

    it("t.assert comes from the same harness", async () => {
        const local = createTAL()
        const seen = capture(local.reporter)
        let same = false
        local.it("check", (t) => {
            same = t.assert.equal === local.strict.equal
        })
        await local.run()

        assert.equal(same, true)
        assert.equal(names(seen, "test:pass").join(""), "check")
    })
})
