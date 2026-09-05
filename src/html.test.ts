import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "./index.ts"

const TITLE = "html.test.ts"

const render = async (
    emit: (reporter: ReturnType<typeof createTAL>["reporter"]) => Promise<void>,
): Promise<string> => {
    const local = createTAL()
    const chunks: string[] = []
    local.reporter.format(local.reporter.html())
    local.reporter.output(text => {
        chunks.push(text)
    })
    await emit(local.reporter)
    await local.run()
    return chunks.join("")
}

const pass = (name: string, extra: object = {}) => ({
    name, nesting: 0, testNumber: 1,
    details: {duration_ms: 1, type: "test" as const}, ...extra,
})

describe(TITLE, () => {
    it("renders list items with status classes", async () => {
        const out = await render(async reporter => {
            await reporter.emit("test:start", {name: "suite", nesting: 0})
            await reporter.emit("test:start", {name: "ok", nesting: 1})
            await reporter.emit("test:pass", {...pass("ok"), nesting: 1})
            await reporter.emit("test:pass", pass("later", {skip: "not now"}))
        })

        assert.match(out, /<div class="tal-r "><span class="tal-suite">▶ suite/)
        assert.match(out, /<div class="tal-r tal-i1"><span class="tal-pass">✔ ok/)
        assert.match(out, /<div class="tal-r "><span class="tal-skip">﹣ later</)
    })

    it("escapes text and failure details", async () => {
        const out = await render(async reporter => {
            await reporter.emit("test:diagnostic", {message: `<&>"'`, nesting: 0, level: "warn"})
            await reporter.emit("test:fail", {
                ...pass("<broken>"),
                details: {duration_ms: 2, type: "test", error: new Error("bad <tag> & data")},
            })
        })

        assert.match(out, /&lt;&amp;&gt;&quot;&apos;/)
        assert.match(out, /&lt;broken&gt;/)
        assert.match(out, /bad &lt;tag&gt; &amp; data/)
        assert.equal(out.includes("<broken>"), false)
        assert.equal(out.includes("<tag>"), false)
    })

    it("escapes a diagnostic level used in an attribute", async () => {
        const out = await render(reporter => reporter.emit("test:diagnostic", {
            message: "unsafe level", nesting: 0,
            level: `info" onclick="alert('x')` as never,
        }))

        assert.match(out, /tal-info&quot; onclick=&quot;alert\(&apos;x&apos;\)/)
        assert.equal(out.includes(`onclick="alert('x')"`), false)
    })

    it("renders diagnostics and omits parent-only failures from the failure list", async () => {
        const subtestsFailed = Object.assign(new Error("child failed"), {
            code: "ERR_TEST_FAILURE", failureType: "subtestsFailed",
        })
        const out = await render(async reporter => {
            await reporter.emit("test:diagnostic", {message: "notice", nesting: 1, level: "info"})
            await reporter.emit("test:fail", {
                ...pass("suite"), details: {duration_ms: 2, type: "suite", error: subtestsFailed},
            })
        })

        assert.match(out, /tal-info">ℹ notice/)
        assert.equal(out.match(/✖ suite/g)?.length, 1)
        assert.equal(out.includes("failing tests:"), false)
    })
})
