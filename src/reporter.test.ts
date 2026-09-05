import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

import {createTAL} from "./index.ts"

const TITLE = "reporter.test.ts"

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        await promise
        return undefined
    } catch (error) {
        return error
    }
}

describe(TITLE, () => {
    it("rejects run() when the formatter throws", async () => {
        const local = createTAL()
        const failure = new Error("formatter failed")
        local.reporter.format(() => {
            throw failure
        })
        local.it("one", () => undefined)

        assert.equal(await caught(local.run()), failure)
    })

    it("rejects run() when async formatter work rejects", async () => {
        const local = createTAL()
        const failure = new Error("async formatter failed")
        local.reporter.format(async function* (source) {
            for await (const _event of source) throw failure
        })
        local.it("one", () => undefined)

        assert.equal(await caught(local.run()), failure)
    })

    it("preserves an undefined reporter rejection reason", async () => {
        const local = createTAL()
        local.reporter.format(() => {
            throw undefined
        })
        local.it("one", () => undefined)
        let rejected = false

        try {
            await local.run()
        } catch (error) {
            rejected = true
            assert.equal(error, undefined)
        }
        assert.equal(rejected, true)
    })

    it("rejects run() when sync or async output fails", async () => {
        for (const asyncOutput of [false, true]) {
            const local = createTAL()
            const failure = new Error(asyncOutput ? "async output failed" : "output failed")
            local.reporter.output(asyncOutput
                ? async () => Promise.reject(failure)
                : () => {
                    throw failure
                })
            local.it("one", () => undefined)

            assert.equal(await caught(local.run()), failure)
        }
    })

    it("rejects when a formatter ends before consuming the summary", async () => {
        const local = createTAL()
        local.reporter.format(async function* () {
            yield "stopped\n"
        })
        local.reporter.output(() => undefined)
        local.it("one", () => undefined)

        const error = await caught(local.run())
        assert.match(String(error), /formatter ended before test:summary/i)
    })

    it("allows a formatter to return immediately after the summary", async () => {
        const local = createTAL()
        local.reporter.format(async function* (source) {
            for await (const event of source) {
                if (event.type === "test:summary") return
            }
        })
        local.reporter.output(() => undefined)
        local.it("one", () => undefined)

        const summary = await local.run()
        assert.equal(summary.success, true)
    })

    it("propagates output failure from a synchronous diagnostic()", async () => {
        const local = createTAL()
        const failure = new Error("diagnostic output failed")
        local.reporter.format(async function* (source) {
            for await (const event of source) {
                if (event.type === "test:diagnostic") yield event.data.message
            }
        })
        local.reporter.output(text => {
            if (text === "from body") throw failure
        })
        local.it("one", t => {
            t.diagnostic("from body")
        })

        assert.equal(await caught(local.run()), failure)
    })

    it("keeps format and output settings for later runs", async () => {
        const local = createTAL()
        const output: string[] = []
        local.reporter.format(async function* (source) {
            for await (const event of source) {
                if (event.type === "test:pass") yield `${event.data.name}\n`
            }
        })
        local.reporter.output(text => {
            output.push(text)
        })

        local.it("first", () => undefined)
        await local.run()
        local.it("second", () => undefined)
        await local.run()

        assert.equal(output.join(""), "first\nsecond\n")
    })

    it("starts a fresh reporter session after a failed run", async () => {
        const local = createTAL()
        const failure = new Error("first formatter failed")
        const output: string[] = []
        let invocation = 0
        local.reporter.format((source) => {
            invocation++
            if (invocation === 1) throw failure
            return (async function* () {
                for await (const event of source) {
                    if (event.type === "test:pass") yield event.data.name
                }
            })()
        })
        local.reporter.output(text => {
            output.push(text)
        })

        local.it("discarded", () => undefined)
        assert.equal(await caught(local.run()), failure)
        local.it("recovered", () => undefined)
        const summary = await local.run()

        assert.equal(summary.counts.tests, 1)
        assert.equal(output.join(""), "recovered")
    })
})
