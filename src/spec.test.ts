import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {createTAL} from "./index.ts"

const TITLE = "spec.test.ts"

// Scaffolding to drive spec() on its own, collecting what it writes.
const render = async (
    emit: (reporter: ReturnType<typeof createTAL>["reporter"]) => Promise<void>,
): Promise<string> => {
    const local = createTAL()
    const lines: string[] = []
    local.reporter.format(local.reporter.spec({colors: false}))
    local.reporter.output(text => {
        lines.push(text)
    })
    await emit(local.reporter)
    await local.run()
    return lines.join("")
}

const pass = (name: string, extra: object = {}) => ({
    name, nesting: 0, testNumber: 1,
    details: {duration_ms: 1, type: "test" as const}, ...extra,
})

describe(TITLE, () => {
    it("renders a passing test", async () => {
        const out = await render(r => r.emit("test:pass", pass("ok one")))

        assert.match(out, /✔ ok one \(1\.000ms\)/)
    })

    it("renders a failing test and repeats it at the end", async () => {
        const out = await render(r => r.emit("test:fail", {
            ...pass("bad one"),
            details: {duration_ms: 2, type: "test", error: new Error("boom")},
        }))

        assert.match(out, /✖ bad one/)
        assert.match(out, /failing tests:/)
        assert.match(out, /boom/)
    })

    it("marks a skipped test with its reason", async () => {
        const out = await render(r => r.emit("test:pass", pass("skipped one", {skip: "why"})))

        assert.match(out, /﹣ skipped one .* # why/)
    })

    it("turns test:start into a suite heading", async () => {
        const out = await render(async r => {
            await r.emit("test:start", {name: "S", nesting: 0})
            await r.emit("test:start", {name: "child", nesting: 1})
            await r.emit("test:pass", {...pass("child"), nesting: 1})
        })

        assert.match(out, /▶ S\n {2}✔ child/)
    })

    it("renders a diagnostic with its level", async () => {
        const out = await render(r => r.emit("test:diagnostic", {
            message: "hello", nesting: 0, level: "info",
        }))

        assert.match(out, /ℹ hello/)
    })

    // emit() accepts any type, and an unknown one used to reach the branch
    // that reads details, where it crashed.
    it("ignores an event type it does not know", async () => {
        const out = await render(async r => {
            await r.emit("my:custom:event", {hello: "world"} as never)
            await r.emit("test:pass", pass("still rendered"))
        })

        assert.match(out, /✔ still rendered/)
        assert.equal(/hello|world/.test(out), false)
    })
})
