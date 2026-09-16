import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type * as declared from "test-assert-lite"
import {createTAL} from "../index.ts"
import {capture, names, ofType, summaryOf} from "../test-utils/capture.ts"

const TITLE = "session/session.test.ts"

// capture listens on what it is given: a window in a page, and here an
// EventTarget of the test's own, so nothing reaches the real one, which
// the page running these suites in a browser listens on itself.
const target = (): EventTarget => new EventTarget()
// Defined rather than assigned: target, for one, is a getter on an Event.
const fire = (on: EventTarget, type: string, fields: object): void => {
    const event = new Event(type)
    for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, {value})
    on.dispatchEvent(event)
}

// The window's own type satisfies what capture asks for.
const check: typeof globalThis extends declared.TAL.EventTargetLike ? true : never = true
void check

describe(TITLE, () => {
    it("takes a reporter by name; a name it has none for runs with spec and is one failed test", async () => {
        const local = createTAL()
        const out: string[] = []
        local.session({reporter: "tap", output: text => {out.push(text)}})
        local.it("named", () => undefined)
        await local.end()
        assert.equal(out[0], "TAP version 13\n")

        const other = createTAL()
        const text: string[] = []
        other.session({reporter: "nope", output: t => {text.push(t)}})
        other.it("still runs", () => undefined)
        assert.equal((await other.end()).success, false)
        assert.match(text.join(""), /unsupported reporter: nope/)
        assert.match(text.join(""), /still runs/)
    })

    it("an uncaught error is one failed test, named after the script by its served path", async () => {
        const local = createTAL()
        const on = target()
        const events = capture(local, {capture: on})
        const thrown = new Error("at the top level")
        fire(on, "error", {error: thrown, filename: "http://127.0.0.1:1/@tal/files/012345678/suite.mjs"})
        fire(on, "error", {target: {src: "http://127.0.0.1:1/@tal/files/012345678/missing.mjs"}})
        fire(on, "unhandledrejection", {reason: new Error("leaked")})
        local.it("declared", () => undefined)
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(names(events, "test:fail"), ["suite.mjs", "missing.mjs", "unhandled rejection"])
        const [first, second] = ofType(events, "test:fail").map(e => e.data.details.error)
        assert.equal(first, thrown)
        assert.equal(second?.message, "failed to load missing.mjs")
        assert.deepEqual(summary.counts, {tests: 4, suites: 0, passed: 1, failed: 3, cancelled: 0, skipped: 0, todo: 0})
    })

    // A leaked rejection arrives while the next test's body is open, as a
    // rule; the failure is declared on the root all the same, and runs after.
    it("an error while a test body is open is a failed test after it", async () => {
        const local = createTAL()
        const on = target()
        const events = capture(local, {capture: on})
        local.it("open", async () => {
            fire(on, "unhandledrejection", {reason: new Error("meanwhile")})
            await new Promise(r => setTimeout(r, 0))
        })
        await local.end()
        const summary = summaryOf(events)

        assert.deepEqual(names(events, "test:pass"), ["open"])
        assert.deepEqual(names(events, "test:fail"), ["unhandled rejection"])
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 1, failed: 1, cancelled: 0, skipped: 0, todo: 0})
    })

    it("end() lets go of the events, and a session without capture takes none", async () => {
        const local = createTAL()
        const on = target()
        capture(local, {capture: on})
        await local.end()
        fire(on, "unhandledrejection", {reason: new Error("after the end")})
        const again = capture(local)
        fire(on, "unhandledrejection", {reason: new Error("without capture")})
        await local.end()

        assert.equal(summaryOf(again).counts.tests, 0)
    })
})
