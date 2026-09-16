import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createTAL} from "../index.ts"
import {capture, names, summaryOf} from "../test-utils/capture.ts"

const TITLE = "session/reporter.test.ts"

const caught = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        await promise
        return undefined
    } catch (error) {
        return error
    }
}

describe(TITLE, () => {

    it("rejects end() when the reporter throws", async () => {
        const local = createTAL()
        const failure = new Error("reporter failed")
        local.session({
            reporter: () => {
                throw failure
            },
        })
        local.it("one", () => undefined)

        assert.equal(await caught(local.end()), failure)
    })

    it("rejects end() when async reporter work rejects", async () => {
        const local = createTAL()
        const failure = new Error("async reporter failed")
        local.session({
            reporter: async function* (source) {
                for await (const _event of source) throw failure
            },
        })
        local.it("one", () => undefined)

        assert.equal(await caught(local.end()), failure)
    })

    it("preserves an undefined reporter rejection reason", async () => {
        const local = createTAL()
        local.session({
            reporter: () => {
                throw undefined
            },
        })
        local.it("one", () => undefined)
        let rejected = false

        try {
            await local.end()
        } catch (error) {
            rejected = true
            assert.equal(error, undefined)
        }
        assert.equal(rejected, true)
    })

    it("rejects end() when sync or async output fails", async () => {
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

            assert.equal(await caught(local.end()), failure)
        }
    })

    it("rejects when a reporter ends before consuming its input", async () => {
        const local = createTAL()
        local.session({
            reporter: async function* () {
                yield "stopped\n"
            },
            output: () => undefined,
        })
        local.it("one", () => undefined)

        const error = await caught(local.end())
        assert.match(String(error), /reporter ended before its input/i)
    })

    it("rejects a manual iterator that returns after the summary without reading done", async () => {
        const local = createTAL()
        local.session({
            reporter: async function* (source) {
                const iterator = source[Symbol.asyncIterator]()
                for (;;) {
                    const result = await iterator.next()
                    if (result.done || result.value.type === "test:summary") return
                }
            },
            output: () => undefined,
        })
        local.it("one", () => undefined)

        const error = await caught(local.end())
        assert.match(String(error), /reporter ended before its input/i)
    })

    it("allows a manual iterator to finish by reading done", async () => {
        const local = createTAL()
        local.session({
            reporter: async function* (source) {
                const iterator = source[Symbol.asyncIterator]()
                while (!(await iterator.next()).done) {
                    // Reading until done is the reporter's completion contract.
                }
            },
            output: () => undefined,
        })
        local.it("one", () => undefined)

        const summary = await local.end()
        assert.equal(summary.success, true)
    })

    it("propagates output failure from a synchronous diagnostic()", async () => {
        const local = createTAL()
        const failure = new Error("diagnostic output failed")
        local.session({
            reporter: async function* (source) {
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

        assert.equal(await caught(local.end()), failure)
    })

    // end() closes the session, settings and all: the next run opens one of
    // its own, with the defaults unless session() is called again.
    it("a session ends with end(), and the next run opens another", async () => {
        const local = createTAL()
        const output: string[] = []
        const settings: NonNullable<Parameters<typeof local.session>[0]> = {
            reporter: async function* (source) {
                for await (const event of source) {
                    if (event.type === "test:pass") yield `${event.data.name}\n`
                }
            },
            output: text => {
                output.push(text)
            },
        }
        local.session(settings)
        local.it("first", () => undefined)
        await local.end()
        local.session(settings)
        local.it("second", () => undefined)
        await local.end()

        assert.equal(output.join(""), "first\nsecond\n")
    })

    // A test declared first opens the default session; session() then has
    // nothing to configure, and says so rather than take settings late.
    it("session() after a declaration throws", () => {
        const local = createTAL()
        local.it("first", () => undefined)

        assert.throws(() => local.session({output: () => undefined}), /before the first test is declared/)
    })

    it("session() twice throws until end() has closed the first", async () => {
        const local = createTAL()
        local.session({output: () => undefined})

        assert.throws(() => local.session({output: () => undefined}), /already open/)
        await local.end()
        local.session({output: () => undefined})
    })

    // end() alone opens the default session and closes it again.
    it("end() with nothing declared reports an empty run", async () => {
        const local = createTAL()
        const events = capture(local)
        const result = await local.end()

        assert.equal(result.success, true)
        assert.equal(summaryOf(events).counts.tests, 0)
    })

    it("a failed end() closes the session too, and the next run starts clean", async () => {
        const local = createTAL()
        const failure = new Error("reporter failed")
        local.session({
            reporter: () => {
                throw failure
            },
        })
        local.it("discarded", () => undefined)
        assert.equal(await caught(local.end()), failure)

        const events = capture(local)
        local.it("recovered", () => undefined)
        const result = await local.end()

        assert.equal(result.success, true)
        assert.deepEqual(names(events, "test:pass"), ["recovered"])
    })
})
