import {strict as assert} from "node:assert"
import {after, before, describe, it} from "node:test"
import {createTAL} from "./index.ts"
import {capture, names, ofType} from "./test-utils/capture.ts"

const TITLE = "session.test.ts"

// capture takes a window's error and unhandledrejection events, which Node
// has no global for: a stand-in keeps the listeners so a test can fire an
// event at them, and see them go with end().
type Listener = (event: Event) => void
const listeners = new Map<string, Listener>()
const stand = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
}
const fire = (type: string, event: object): void => listeners.get(type)?.(event as Event)

describe(TITLE, () => {
    before(() => {
        Object.assign(globalThis, stand)
    })

    after(() => {
        delete (globalThis as {addEventListener?: unknown}).addEventListener
        delete (globalThis as {removeEventListener?: unknown}).removeEventListener
    })

    it("an uncaught error is one failed test, named after the script by its served path", async () => {
        const local = createTAL()
        const events = capture(local, {capture: true})
        const thrown = new Error("at the top level")
        fire("error", {error: thrown, filename: "http://127.0.0.1:1/@tal/files/012345678/suite.mjs"})
        fire("error", {target: {src: "http://127.0.0.1:1/@tal/files/012345678/missing.mjs"}})
        fire("unhandledrejection", {reason: new Error("leaked")})
        local.it("declared", () => undefined)
        const summary = await local.run()

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
        const events = capture(local, {capture: true})
        local.it("open", async () => {
            fire("unhandledrejection", {reason: new Error("meanwhile")})
            await new Promise(r => setTimeout(r, 0))
        })
        const summary = await local.run()

        assert.deepEqual(names(events, "test:pass"), ["open"])
        assert.deepEqual(names(events, "test:fail"), ["unhandled rejection"])
        assert.deepEqual(summary.counts, {tests: 2, suites: 0, passed: 1, failed: 1, cancelled: 0, skipped: 0, todo: 0})
    })

    it("end() lets go of the events, and a session without capture takes none", async () => {
        const local = createTAL()
        local.session({capture: true, output: () => undefined})
        assert.deepEqual([...listeners.keys()].sort(), ["error", "unhandledrejection"])
        await local.end(true)
        assert.equal(listeners.size, 0)

        const plain = createTAL()
        plain.session({output: () => undefined})
        assert.equal(listeners.size, 0)
        await plain.end(true)
    })
})
