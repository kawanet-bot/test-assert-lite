import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "../index.ts"
import {capture} from "../test-utils/capture.ts"

const TITLE = "suite/context.test.ts"

// The test context beyond t.test(): t.diagnostic(), t.assert and t.name.

// Every test builds its own harness, so sharedTAL stays clean and
// nothing re-enters when TAL is itself the runner.
describe(TITLE, () => {
    it("t.diagnostic() emits an info event", async () => {
        const local = createTAL()
        const events = capture(local)
        local.test.it("noisy", (t) => {
            t.diagnostic("hello")
        })
        await local.session.end()

        const found = events.find(e => e.type === "test:diagnostic" && e.data.message === "hello")
        assert.ok(found)
        assert.equal((found?.data as {level: string}).level, "info")
    })

    it("t.assert is available on the context", async () => {
        const local = createTAL()
        local.session.session({output: () => undefined})
        let caught: unknown
        local.test.it("asserting", (t) => {
            t.assert.equal(1, 1)
            try {
                t.assert.equal(1, 2)
            } catch (e) {
                caught = e
            }
        })
        await local.session.end()

        assert.ok(caught instanceof Error)
        assert.equal((caught as Error & {code?: string}).code, "ERR_ASSERTION")
    })

    // node:test's t.assert is the plain assert, not assert.strict: its
    // equal / deepEqual compare loosely, and the strict ones go by their
    // *StrictEqual names.
    it("t.assert compares loosely under the plain names, strictly under the strict ones", async () => {
        const local = createTAL()
        local.session.session({output: () => undefined})
        const outcome: Record<string, boolean> = {}
        const attempt = (name: string, fn: () => void): void => {
            try {
                fn()
                outcome[name] = true
            } catch {
                outcome[name] = false
            }
        }
        local.test.it("asserting", (t) => {
            attempt("equal", () => t.assert.equal(1, "1"))
            attempt("deepEqual", () => t.assert.deepEqual({a: 1}, {a: "1"}))
            attempt("strictEqual", () => t.assert.strictEqual(1, "1"))
            attempt("deepStrictEqual", () => t.assert.deepStrictEqual({a: 1}, {a: "1"}))
        })
        await local.session.end()

        assert.deepEqual(outcome, {equal: true, deepEqual: true, strictEqual: false, deepStrictEqual: false})
    })

    it("the context carries the test name", async () => {
        const local = createTAL()
        local.session.session({output: () => undefined})
        let seen = ""
        local.test.it("named", (t) => {
            seen = t.name
        })
        await local.session.end()

        assert.equal(seen, "named")
    })
})
