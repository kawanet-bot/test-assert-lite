import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./../index.ts"
import {capture, names, ofType} from "./../test-utils/capture.ts"

const TITLE = "runner/runner-suite.test.ts"

// describe and it: declaration order, nesting, numbering, and how a suite
// carries the verdict of its children.

// Every test builds its own harness, so the default one stays clean and
// nothing re-enters when TAL is itself the runner.
describe(TITLE, () => {
    // children is one queue mixing describe and it in declaration order,
    // which is what reproduces node:test's ordering. A describe body runs
    // when the walk reaches it.
    it("runs children in declaration order", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.it("top1", () => {
            order.push("top1")
        })
        local.describe("suite", () => {
            order.push("suite body")
            local.it("child", () => {
                order.push("child")
            })
        })
        local.it("top2", () => {
            order.push("top2")
        })
        await local.run()

        assert.deepEqual(order, ["top1", "suite body", "child", "top2"])
    })

    it("describe nesting increases the reported nesting", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("outer", () => {
            local.describe("inner", () => {
                local.it("deep", () => undefined)
            })
        })
        await local.run()

        const pass = events.find(e => e.type === "test:pass")
        assert.equal((pass?.data as {nesting: number}).nesting, 2)
        assert.deepEqual(names(events, "test:start"), ["outer", "inner", "deep"])
    })

    it("async describe bodies are awaited before their children run", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.describe("async suite", async () => {
            await new Promise(r => setTimeout(r, 20))
            order.push("registered late")
            local.it("late child", () => {
                order.push("late child body")
            })
        })
        await local.run()

        assert.deepEqual(order, ["registered late", "late child body"])
    })

    it("a throwing describe body is reported and flips success", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("broken", () => {
            throw new Error("bad suite")
        })
        const summary = await local.run()

        assert.equal(summary.success, false)
        const fail = events.find(e => e.type === "test:fail")
        assert.equal((fail?.data as {details: {type: string}}).details.type, "suite")
    })

    it("describe.skip does not run the body", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        let ran = false
        local.describe.skip("skipped suite", () => {
            ran = true
            local.it("never", () => undefined)
        })
        const summary = await local.run()

        assert.equal(ran, false)
        assert.equal(summary.counts.tests, 0)
        assert.equal(summary.counts.suites, 1)
    })

    // The registration API is closed inside a test body. it() has a stand-in
    // in t.test(), so its message says so.
    it("the declaration API is rejected from inside a test body", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const caught: string[] = []
        const attempt = (fn: () => void) => {
            try {
                fn()
                caught.push("(not rejected)")
            } catch (e) {
                caught.push(String((e as Error).message))
            }
        }

        local.it("host", () => {
            attempt(() => local.describe("nope", () => undefined))
            attempt(() => local.it("nope", () => undefined))
            attempt(() => local.before(() => undefined))
            attempt(() => local.after(() => undefined))
        })
        await local.run()

        assert.equal(caught.join("\n"), [
            "describe() cannot be called from inside a test body",
            "it() cannot be called from inside a test body; use t.test() instead",
            "before() cannot be called from inside a test body",
            "after() cannot be called from inside a test body",
        ].join("\n"))
    })

    // Compared against what node:test actually produced for the same shape,
    // covering hook scope, describe and it interleaving, and grandchildren.
    it("matches the execution order of node:test", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        const mark = (s: string) => () => {
            order.push(s)
        }

        local.before(mark("root:before"))
        local.after(mark("root:after"))
        local.it("t1", mark("t1"))
        local.describe("S1", () => {
            local.before(mark("S1:before"))
            local.after(mark("S1:after"))
            local.it("s1a", mark("s1a"))
            local.describe("S2", () => {
                local.before(mark("S2:before"))
                local.it("s2a", mark("s2a"))
            })
            local.it("s1b", mark("s1b"))
        })
        local.it("t2", mark("t2"))
        await local.run()

        assert.equal(order.join(" "), [
            "root:before", "t1",
            "S1:before", "s1a", "S2:before", "s2a", "s1b", "S1:after",
            "t2", "root:after",
        ].join(" "))
    })

    // node:test reports a suite after its children, so the suite line
    // carries the verdict of everything below it.
    it("a passing suite is reported after its children", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("S", () => {
            local.it("a", () => undefined)
        })
        await local.run()

        const results = ofType(events, "test:pass").map(e => `${e.data.name}:${e.data.details.type}:${e.data.nesting}`)
        assert.deepEqual(results, ["a:test:1", "S:suite:0"])
    })

    it("describe.skip is reported as a skipped suite", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe.skip("S", () => {
            local.it("never", () => undefined)
        })
        const summary = await local.run()

        const pass = ofType(events, "test:pass")[0]?.data
        assert.equal(pass?.name, "S")
        assert.equal(pass?.skip, true)
        assert.equal(pass?.details.type, "suite")
        assert.equal(summary.counts.suites, 1)
        assert.equal(summary.counts.tests, 0)
    })

    // The parent's own failure adds nothing to `fail`: node:test counts the
    // child once and marks the suite subtestsFailed.
    it("a suite whose child fails is reported as subtestsFailed", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("S", () => {
            local.it("bad", () => {
                throw new Error("x")
            })
            local.it("ok", () => undefined)
        })
        const summary = await local.run()

        const fails = ofType(events, "test:fail")
        assert.deepEqual(fails.map(e => e.data.name), ["bad", "S"])
        const suite = fails[1]?.data.details.error as Error & {failureType?: string}
        assert.equal(suite?.failureType, "subtestsFailed")
        assert.equal(suite?.message, "1 subtest failed")
        assert.equal(summary.counts.failed, 1)
        assert.equal(summary.counts.suites, 1)
        assert.equal(summary.success, false)
    })

    // The skip decides the test's own count, not whether its suite failed.
    it("a skipped test that failed still fails its suite", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("S", () => {
            local.it("skip then throw", (t) => {
                t.skip("why")
                throw new Error("boom")
            })
        })
        const summary = await local.run()

        const suite = ofType(events, "test:fail").find(e => e.data.name === "S")?.data
        assert.equal((suite?.details.error as {failureType?: string}).failureType, "subtestsFailed")
        assert.deepEqual(summary.counts, {tests: 1, suites: 1, passed: 0, failed: 0, cancelled: 0, skipped: 1})
        assert.equal(summary.success, false)
    })

    it("a throwing describe body cancels the children already registered", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        const body = new Error("body")
        local.describe("S", () => {
            local.it("a", () => undefined)
            throw body
        })
        const summary = await local.run()

        const fails = ofType(events, "test:fail")
        assert.deepEqual(fails.map(e => e.data.name), ["a", "S"])
        assert.equal(fails[1]?.data.details.error, body)
        assert.equal(summary.counts.tests, 1)
        assert.equal(summary.counts.cancelled, 1)
    })

    it("a suite's result carries its own nesting", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("S1", () => {
            local.describe("S2", () => {
                local.before(() => {
                    throw new Error("setup")
                })
                local.it("x", () => undefined)
            })
        })
        await local.run()

        const s2 = ofType(events, "test:fail").find(e => e.data.name === "S2")?.data
        assert.equal(s2?.nesting, 1)
        assert.equal(s2?.details.type, "suite")
    })

    // node:test numbers the children of each parent from 1, suites and tests together.
    it("testNumber counts within the parent", async () => {
        const local = createTAL()
        const events = capture(local.reporter)
        local.describe("S", () => {
            local.it("a", () => undefined)
            local.it("b", () => undefined)
        })
        local.it("x", () => undefined)
        await local.run()

        const numbered = ofType(events, "test:pass").map(e => `${e.data.name}#${e.data.testNumber}`)
        assert.deepEqual(numbered, ["a#1", "b#2", "S#1", "x#2"])
    })
})
