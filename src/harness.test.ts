import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./index.ts"
import {capture, names, summaryOf} from "./test-utils/capture.ts"

const TITLE = "harness.test.ts"

describe(TITLE, () => {
    it("createTAL returns the bound API", () => {
        const local = createTAL()

        assert.equal(typeof local.test.suite, "function")
        assert.equal(typeof local.test.describe, "function")
        assert.equal(typeof local.test.test, "function")
        assert.equal(typeof local.test.it, "function")
        assert.equal(typeof local.test.before, "function")
        assert.equal(typeof local.test.after, "function")
        assert.equal(typeof local.reporter, "object")
        assert.equal(typeof local.assert, "function")
        assert.equal(typeof local.assert.strict, "function")
    })

    it("describe aliases suite and it aliases test", () => {
        const local = createTAL()

        assert.equal(local.test.describe, local.test.suite)
        assert.equal(local.test.it, local.test.test)
    })

    // Isolation is the whole point of the factory, so hold the line that a
    // test registered on one harness never joins another harness's end().
    it("each harness keeps its own registry", async () => {
        const a = createTAL()
        const b = createTAL()
        const seenA = capture(a)
        const seenB = capture(b)

        a.test.it("only on a", () => undefined)
        b.test.it("only on b", () => undefined)
        b.test.it("also on b", () => undefined)

        await b.session.end()
        await a.session.end()
        assert.equal(summaryOf(seenB).counts.tests, 2)
        assert.equal(summaryOf(seenA).counts.tests, 1)
    })

    it("two harnesses do not share hooks", async () => {
        const a = createTAL()
        const b = createTAL()
        a.session.session({output: () => undefined})
        b.session.session({output: () => undefined})
        const order: string[] = []

        a.test.before(() => {
            order.push("a:before")
        })
        a.test.it("a-test", () => {
            order.push("a-test")
        })
        b.test.it("b-test", () => {
            order.push("b-test")
        })

        await b.session.end()
        await a.session.end()

        assert.deepEqual(order, ["b-test", "a:before", "a-test"])
    })

    it("end() resets only its own harness", async () => {
        const local = createTAL()
        const first = capture(local)
        local.test.it("once", () => undefined)
        await local.session.end()
        assert.equal(summaryOf(first).counts.tests, 1)

        const second = capture(local)
        await local.session.end()
        assert.equal(summaryOf(second).counts.tests, 0)
    })

    // The session belongs to the harness too, so output cannot leak across.
    it("each harness owns its session", async () => {
        const a = createTAL()
        const b = createTAL()
        const seenByA = capture(a)
        const seenByB = capture(b)

        assert.notEqual(a.session, b.session)

        b.test.it("only on b", () => undefined)
        await b.session.end()

        assert.ok(names(seenByB, "test:pass").includes("only on b"))
        assert.equal(seenByA.length, 0)
    })

    it("output set on one harness does not reach the other", async () => {
        const local = createTAL()
        const lines: string[] = []
        local.session.session({
            reporter: local.reporter.spec({colors: false}),
            output: text => {
                lines.push(text)
            },
        })

        local.test.it("visible", () => undefined)
        await local.session.end()

        assert.ok(lines.join("").includes("visible"))
    })

    // strict holds no state and needs no per-harness copy, but it rides on
    // TestHarness so that the harness really is the whole set.
    it("each harness gets its own assert surface", () => {
        const a = createTAL()
        const b = createTAL()

        assert.notEqual(a.assert.strict, b.assert.strict)
        assert.equal(typeof a.assert.strict.equal, "function")
        a.assert.strict.equal(1, 1)
        assert.throws(() => b.assert.strict.equal(1, 2), /expected 2, got 1/)
    })

    it("t.assert comes from the same harness", async () => {
        const local = createTAL()
        const seen = capture(local)
        let same = false
        local.test.it("check", (t) => {
            // t.assert is the loose set, so its equal is the harness's plain
            // assert.equal, and its strictEqual the strict one.
            same = t.assert.equal === local.assert.equal && t.assert.strictEqual === local.assert.strict.equal
        })
        await local.session.end()

        assert.equal(same, true)
        assert.equal(names(seen, "test:pass").join(""), "check")
    })
})
