import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {createTAL} from "./index.ts"
import {capture, names} from "./test-utils/capture.ts"

const TITLE = "suite.test.ts"

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

        assert.equal(order.join(" | "), ["top1", "suite body", "child", "top2"].join(" | "))
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
        assert.equal(names(events, "test:start").join(" | "), ["outer", "inner", "deep"].join(" | "))
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

        assert.equal(order.join(" | "), ["registered late", "late child body"].join(" | "))
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

    it("before and after wrap the run", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.before(() => {
            order.push("before")
        })
        local.after(() => {
            order.push("after")
        })
        local.it("middle", () => {
            order.push("test")
        })
        await local.run()

        assert.equal(order.join(" | "), ["before", "test", "after"].join(" | "))
    })

    // A hook belongs to the suite that declares it, scoped as in node:test.
    it("hooks are scoped to the suite that declares them", async () => {
        const local = createTAL()
        local.reporter.output(() => undefined)
        const order: string[] = []
        local.describe("S", () => {
            local.before(() => {
                order.push("S:before")
            })
            local.after(() => {
                order.push("S:after")
            })
            local.it("inside", () => {
                order.push("inside")
            })
        })
        local.it("outside", () => {
            order.push("outside")
        })
        await local.run()

        assert.equal(order.join(" | "), ["S:before", "inside", "S:after", "outside"].join(" | "))
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
})
