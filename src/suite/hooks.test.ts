import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "../index.ts"
import {capture, names, ofType, summaryOf} from "../test-utils/capture.ts"

const TITLE = "suite/hooks.test.ts"

// before and after: their scope, and how a failing hook or suite body is
// charged and cancels what it covers.

// Every test builds its own harness, so sharedTAL stays clean and
// nothing re-enters when TAL is itself the runner.
describe(TITLE, () => {
    it("before and after wrap the run", async () => {
        const local = createTAL()
        local.session({output: () => undefined})
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
        await local.end()

        assert.deepEqual(order, ["before", "test", "after"])
    })

    // A hook belongs to the suite that declares it, scoped as in node:test.
    it("hooks are scoped to the suite that declares them", async () => {
        const local = createTAL()
        local.session({output: () => undefined})
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
        await local.end()

        assert.deepEqual(order, ["S:before", "inside", "S:after", "outside"])
    })

    // Nothing below a broken setup may run. node:test cancels the children,
    // charges the hook's error to the suite, and still runs after.
    it("a failing before hook cancels the children and still runs after", async () => {
        const local = createTAL()
        const events = capture(local)
        const order: string[] = []
        const setup = new Error("setup")
        local.describe("S", () => {
            local.before(() => {
                throw setup
            })
            local.after(() => {
                order.push("after")
            })
            local.it("a", () => {
                order.push("a")
            })
            local.it("b", () => {
                order.push("b")
            })
        })
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(order, ["after"])
        const fails = ofType(events, "test:fail")
        assert.deepEqual(fails.map(e => e.data.name), ["a", "b", "S"])
        assert.equal((fails[0]?.data.details.error as {failureType?: string}).failureType, "cancelledByParent")
        assert.equal(fails[2]?.data.details.error, setup)
        assert.deepEqual(summary.counts, {tests: 2, suites: 1, passed: 0, failed: 0, cancelled: 2, skipped: 0, todo: 0})
        assert.equal(summary.success, false)
    })

    // node:test runs the suite's hooks even when its body threw, and the
    // body's error is the one charged to the suite.
    it("a throwing describe body still runs the hooks declared before the throw", async () => {
        const local = createTAL()
        const events = capture(local)
        const order: string[] = []
        const broken = new Error("body")
        local.describe("S", () => {
            local.before(() => {
                order.push("before")
            })
            local.after(() => {
                order.push("after")
            })
            local.it("a", () => {
                order.push("a")
            })
            throw broken
        })
        const summary = await local.end()

        assert.deepEqual(order, ["before", "after"])
        const fails = ofType(events, "test:fail")
        assert.deepEqual(fails.map(e => e.data.name), ["a", "S"])
        assert.equal(fails[1]?.data.details.error, broken)
        assert.equal(summary.success, false)
    })

    // Under node --test every file loads before the tests start, so the
    // root hooks declared on either side of an await wrap the whole run:
    // the before hooks ahead of the first test, the after hooks once.
    it("root hooks declared around a top-level await wrap the whole run", async () => {
        const local = createTAL()
        local.session({output: () => undefined})
        const order: string[] = []
        local.before(() => {
            order.push("before1")
        })
        local.describe("A", () => {
            local.it("a", () => {
                order.push("a")
            })
            local.after(() => {
                order.push("after(A)")
            })
        })
        local.after(() => {
            order.push("after1")
        })
        await new Promise(r => setTimeout(r, 0))
        local.describe("B", () => {
            local.it("b", () => {
                order.push("b")
            })
        })
        local.after(() => {
            order.push("after2")
        })
        local.before(() => {
            order.push("before2")
        })
        local.it("c", () => {
            order.push("c")
        })
        await local.end()

        assert.deepEqual(order, ["before1", "before2", "a", "after(A)", "b", "c", "after1", "after2"])
    })

    it("a failing after hook fails the suite but keeps the children passed", async () => {
        const local = createTAL()
        const events = capture(local)
        const teardown = new Error("teardown")
        local.describe("S", () => {
            local.after(() => {
                throw teardown
            })
            local.it("a", () => undefined)
        })
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(names(events, "test:pass"), ["a"])
        const fail = ofType(events, "test:fail")[0]?.data
        assert.equal(fail?.name, "S")
        assert.equal(fail?.details.error, teardown)
        assert.equal(summary.counts.passed, 1)
        assert.equal(summary.counts.failed, 0)
        assert.equal(summary.success, false)
    })

    // The root has no result of its own, so node:test charges its before
    // hook's error to each direct child: tests fail, suites cancel theirs.
    it("a failing root before hook is charged to the direct children", async () => {
        const local = createTAL()
        const events = capture(local)
        const setup = new Error("root setup")
        let ran = 0
        local.before(() => {
            throw setup
        })
        local.it("a", () => {
            ran++
        })
        local.it("b", () => {
            ran++
        })
        local.describe("S", () => {
            local.it("c", () => {
                ran++
            })
        })
        await local.end()
        const summary = summaryOf(events)

        assert.equal(ran, 0)
        const fails = ofType(events, "test:fail")
        assert.deepEqual(fails.map(e => e.data.name), ["a", "b", "c", "S"])
        assert.equal(fails[0]?.data.details.error, setup)
        assert.equal((fails[2]?.data.details.error as {failureType?: string}).failureType, "cancelledByParent")
        assert.equal(fails[3]?.data.details.error, setup)
        assert.deepEqual(summary.counts, {tests: 3, suites: 1, passed: 0, failed: 2, cancelled: 1, skipped: 0, todo: 0})
    })

    // node:test lets this run pass, since the error has no child to land on.
    // A failed setup is never green here.
    it("a failing root before hook with no children still fails the run", async () => {
        const local = createTAL()
        const events = capture(local)
        local.before(() => {
            throw new Error("root setup")
        })
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(names(events, "test:fail"), ["root before hook"])
        assert.equal(summary.counts.tests, 0)
        assert.equal(summary.success, false)
    })

    // With no before failure to report, the after failure must not be
    // repeated under the before hook's name.
    it("a failing root after hook with no children is reported once", async () => {
        const local = createTAL()
        const events = capture(local)
        local.after(() => {
            throw new Error("root teardown")
        })
        const summary = await local.end()

        assert.deepEqual(names(events, "test:fail"), ["root after hook"])
        assert.equal(summary.success, false)
    })

    it("a failing root after hook is reported without being counted", async () => {
        const local = createTAL()
        const events = capture(local)
        local.after(() => {
            throw new Error("root teardown")
        })
        local.it("a", () => undefined)
        await local.end()
        const summary = summaryOf(events)

        assert.equal(names(events, "test:fail").length, 1)
        assert.deepEqual(summary.counts, {tests: 1, suites: 0, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 0})
        assert.equal(summary.success, false)
    })

    // node:test keeps the skip on a test it cancels: the event is a failure
    // carrying the parent's error, but the count goes to skipped.
    it("a skipped test under a failing before hook stays skipped", async () => {
        const local = createTAL()
        const events = capture(local)
        local.describe("S", () => {
            local.before(() => {
                throw new Error("setup")
            })
            local.it("skipped", {skip: true}, () => undefined)
            local.it("plain", () => undefined)
        })
        await local.end()
        const summary = summaryOf(events)

        const skipped = ofType(events, "test:fail").find(e => e.data.name === "skipped")?.data
        assert.equal(skipped?.skip, true)
        assert.equal((skipped?.details.error as {failureType?: string}).failureType, "cancelledByParent")
        assert.deepEqual(summary.counts, {tests: 2, suites: 1, passed: 0, failed: 0, cancelled: 1, skipped: 1, todo: 0})
        assert.equal(summary.success, false)
    })

    // With nothing but a skipped suite below a failing root before hook,
    // the skipped suite is the only place the failure can be reported.
    it("a failing root before hook still fails a run of skipped children", async () => {
        const local = createTAL()
        const events = capture(local)
        const setup = new Error("root setup")
        local.before(() => {
            throw setup
        })
        local.it("skipped", {skip: "why"}, () => undefined)
        local.describe.skip("SK", () => {
            local.it("x", () => undefined)
        })
        await local.end()
        const summary = summaryOf(events)

        const fails = ofType(events, "test:fail")
        assert.deepEqual(fails.map(e => `${e.data.name}:${String(e.data.skip)}`), ["skipped:why", "SK:true"])
        assert.equal(fails[1]?.data.details.error, setup)
        assert.deepEqual(summary.counts, {tests: 1, suites: 1, passed: 0, failed: 0, cancelled: 0, skipped: 1, todo: 0})
        assert.equal(summary.success, false)
    })

    // A suite below a failed setup still runs its body to declare its
    // children, and its report covers the time that took.
    it("a cancelled suite reports the time its body took", async () => {
        const local = createTAL()
        const events = capture(local)
        local.before(() => {
            throw new Error("root setup")
        })
        local.describe("S", async () => {
            await new Promise(r => setTimeout(r, 20))
            local.it("x", () => undefined)
        })
        await local.end()

        const suite = ofType(events, "test:fail").find(e => e.data.name === "S")?.data
        assert.ok((suite?.details.duration_ms ?? -1) >= 10)
    })

    it("cancellation reaches the grandchildren", async () => {
        const local = createTAL()
        const events = capture(local)
        local.describe("P", () => {
            local.before(() => {
                throw new Error("setup")
            })
            local.describe("C", () => {
                local.it("g", () => undefined)
            })
            local.it("p1", () => undefined)
        })
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(names(events, "test:start"), ["P", "C", "g", "p1"])
        assert.deepEqual(names(events, "test:fail"), ["g", "C", "p1", "P"])
        assert.equal(summary.counts.suites, 2)
        assert.equal(summary.counts.cancelled, 2)
    })
})
