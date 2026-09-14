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
        local.session({
            format: () => {
                throw failure
            },
        })
        local.it("one", () => undefined)

        assert.equal(await caught(local.run()), failure)
    })

    it("rejects run() when async formatter work rejects", async () => {
        const local = createTAL()
        const failure = new Error("async formatter failed")
        local.session({
            format: async function* (source) {
                for await (const _event of source) throw failure
            },
        })
        local.it("one", () => undefined)

        assert.equal(await caught(local.run()), failure)
    })

    it("preserves an undefined reporter rejection reason", async () => {
        const local = createTAL()
        local.session({
            format: () => {
                throw undefined
            },
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
            local.session({
                output: asyncOutput
                    ? async () => Promise.reject(failure)
                    : () => {
                        throw failure
                    },
            })
            local.it("one", () => undefined)

            assert.equal(await caught(local.run()), failure)
        }
    })

    it("rejects when a formatter ends before consuming its input", async () => {
        const local = createTAL()
        local.session({
            format: async function* () {
                yield "stopped\n"
            },
            output: () => undefined,
        })
        local.it("one", () => undefined)

        const error = await caught(local.run())
        assert.match(String(error), /formatter ended before its input/i)
    })

    it("rejects a manual iterator that returns after the summary without reading done", async () => {
        const local = createTAL()
        local.session({
            format: async function* (source) {
                const iterator = source[Symbol.asyncIterator]()
                for (;;) {
                    const result = await iterator.next()
                    if (result.done || result.value.type === "test:summary") return
                }
            },
            output: () => undefined,
        })
        local.it("one", () => undefined)

        const error = await caught(local.run())
        assert.match(String(error), /formatter ended before its input/i)
    })

    it("allows a manual iterator to finish by reading done", async () => {
        const local = createTAL()
        local.session({
            format: async function* (source) {
                const iterator = source[Symbol.asyncIterator]()
                while (!(await iterator.next()).done) {
                    // Reading until done is the formatter's completion contract.
                }
            },
            output: () => undefined,
        })
        local.it("one", () => undefined)

        const summary = await local.run()
        assert.equal(summary.success, true)
    })

    it("propagates output failure from a synchronous diagnostic()", async () => {
        const local = createTAL()
        const failure = new Error("diagnostic output failed")
        local.session({
            format: async function* (source) {
                for await (const event of source) {
                    if (event.type === "test:diagnostic") yield event.data.message
                }
            },
            output: text => {
                if (text === "from body") throw failure
            },
        })
        local.it("one", t => {
            t.diagnostic("from body")
        })

        assert.equal(await caught(local.run()), failure)
    })

    it("keeps format and output settings for later runs", async () => {
        const local = createTAL()
        const output: string[] = []
        local.session({
            format: async function* (source) {
                for await (const event of source) {
                    if (event.type === "test:pass") yield `${event.data.name}\n`
                }
            },
            output: text => {
                output.push(text)
            },
        })

        local.it("first", () => undefined)
        await local.run()
        local.it("second", () => undefined)
        await local.run()

        assert.equal(output.join(""), "first\nsecond\n")
    })

    // A test declared first opens the default session; session() then has
    // nothing to configure, and says so rather than take settings late.
    it("session() after a declaration throws", () => {
        const local = createTAL()
        local.it("first", () => undefined)

        assert.throws(() => local.session({output: () => undefined}), /before the first test is declared/)
    })

    it("session() twice throws until end() closes the first", async () => {
        const local = createTAL()
        local.session({output: () => undefined})

        assert.throws(() => local.session({output: () => undefined}), /already open/)
        await local.end(true)
        local.session({output: () => undefined})
    })

    it("end() without a session does nothing", async () => {
        const local = createTAL()
        await local.end(true)
    })

    it("starts a fresh reporter session after a failed run", async () => {
        const local = createTAL()
        const failure = new Error("first formatter failed")
        const output: string[] = []
        let invocation = 0
        local.session({
            format: (source) => {
                invocation++
                if (invocation === 1) throw failure
                return (async function* () {
                    for await (const event of source) {
                        if (event.type === "test:pass") yield event.data.name
                    }
                })()
            },
            output: text => {
                output.push(text)
            },
        })

        local.it("discarded", () => undefined)
        assert.equal(await caught(local.run()), failure)
        local.it("recovered", () => undefined)
        const summary = await local.run()

        assert.equal(summary.counts.tests, 1)
        assert.equal(output.join(""), "recovered")
    })
})
