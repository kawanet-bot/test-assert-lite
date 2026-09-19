import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
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
const check: typeof globalThis extends TAL.EventTargetLike ? true : never = true
void check

describe(TITLE, () => {
    // The report is spec's, coloured on a TTY, so the lines are matched
    // without an anchor. The package name is one that does not exist.
    it("a name that is no module runs with spec and is one failed test", async () => {
        const local = createTAL()
        const text: string[] = []
        local.session.session({
            reporter: "@kawanet/invalid", output: t => {
                text.push(t)
            },
        })
        local.test.it("still runs", () => undefined)
        assert.equal((await local.session.end()).success, false)
        assert.match(text.join(""), /✖ import\("@kawanet\/invalid"\)/)
        assert.match(text.join(""), /✔ still runs/)
    })

    it("a name starting with . is not imported, and is one failed test", async () => {
        const local = createTAL()
        const lines: string[] = []
        local.session.session({
            reporter: "./nope.mjs", output: t => {
                lines.push(t)
            },
        })
        assert.equal((await local.session.end()).success, false)
        assert.match(lines.join(""), /unsupported reporter: \.\/nope\.mjs/)
    })

    it("summary: false leaves the counts, the version and the user agent off; the plan stays", async () => {
        const local = createTAL()
        const out: string[] = []
        local.session.session({reporter: "tap", summary: false, output: t => {out.push(t)}})
        local.test.it("fails", () => {
            throw new Error("boom")
        })
        assert.equal((await local.session.end()).success, false)
        const text = out.join("")
        assert.equal(text.includes("# tests "), false)
        assert.equal(text.includes("# test-assert-lite "), false)
        assert.match(text, /^not ok 1 - fails$/m)
        assert.match(text, /^1\.\.1$/m)
    })

    // load() takes a URL a page and Node both import: a data: module that
    // declares nothing, and one that cannot be fetched.
    it("load() imports a suite, and files one that does not load as a failed test", async () => {
        const local = createTAL()
        const text: string[] = []
        local.session.session({reporter: "tap", output: t => {text.push(t)}})
        await local.session.load("data:text/javascript,export const loaded = 1")
        assert.equal((await local.session.end()).success, true)

        const other = createTAL()
        const lines: string[] = []
        other.session.session({reporter: "tap", output: t => {lines.push(t)}})
        await other.session.load("http://127.0.0.1:1/nope.mjs")
        assert.equal((await other.session.end()).success, false)
        assert.match(lines.join(""), /^not ok 1 - nope\.mjs$/m)

        const inline = createTAL()
        const said: string[] = []
        inline.session.session({reporter: "tap", output: t => {said.push(t)}})
        await inline.session.load("data:text/javascript,throw new Error('at the top')")
        assert.equal((await inline.session.end()).success, false)
        assert.match(said.join(""), /^not ok 1 - \[eval\]$/m)
    })

    it("takes a reporter by name", async () => {
        const local = createTAL()
        const out: string[] = []
        local.session.session({
            reporter: "tap", output: text => {
                out.push(text)
            },
        })
        local.test.it("named", () => undefined)
        await local.session.end()
        assert.equal(out[0], "TAP version 13\n")
    })

    it("takes a reporter by its module name: the default export, as node --test-reporter has it", async () => {
        const local = createTAL()
        const out: string[] = []
        local.session.session({
            reporter: "test-assert-lite/reporter/tap", output: text => {
                out.push(text)
            },
        })
        local.test.it("imported", () => undefined)
        assert.equal((await local.session.end()).success, true)
        assert.equal(out[0], "TAP version 13\n")
        assert.match(out.join(""), /^ok 1 - imported$/m)
    })

    it("an uncaught error is one failed test, named after the script by its served path", async () => {
        const local = createTAL()
        const on = target()
        const events = capture(local, {capture: on})
        const thrown = new Error("at the top level")
        fire(on, "error", {error: thrown, filename: "http://127.0.0.1:1/@tal/files/012345678/suite.mjs"})
        fire(on, "error", {target: {src: "http://127.0.0.1:1/@tal/files/012345678/missing.mjs"}})
        fire(on, "unhandledrejection", {reason: new Error("leaked")})
        local.test.it("declared", () => undefined)
        await local.session.end()
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
        local.test.it("open", async () => {
            fire(on, "unhandledrejection", {reason: new Error("meanwhile")})
            await new Promise(r => setTimeout(r, 0))
        })
        await local.session.end()
        const summary = summaryOf(events)

        assert.deepEqual(names(events, "test:pass"), ["open"])
        assert.deepEqual(names(events, "test:fail"), ["unhandled rejection"])
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 1, failed: 1, cancelled: 0, skipped: 0, todo: 0})
    })

    it("end() lets go of the events, and a session without capture takes none", async () => {
        const local = createTAL()
        const on = target()
        capture(local, {capture: on})
        await local.session.end()
        fire(on, "unhandledrejection", {reason: new Error("after the end")})
        const again = capture(local)
        fire(on, "unhandledrejection", {reason: new Error("without capture")})
        await local.session.end()

        assert.equal(summaryOf(again).counts.tests, 0)
    })
})
