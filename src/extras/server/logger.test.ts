import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createBufWriter} from "../../utils/buf-writer.ts"
import {logger} from "./logger.ts"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose, createContext} from "./middleware.ts"

const TITLE = "extras/server/logger.test.ts"

const NEWLINE = /(?<=\n)(?=\S)/

// The chain as serve() runs it: a throw is a 500, unanswered is a 404.
const run = (handlers: MiddlewareHandler[], url: string): Promise<unknown> => {
    const chain = compose(handlers, (_, c) => c.body(null, 500), c => c.body(null, 404))
    return chain(createContext(new Request(url)), async () => undefined)
}

const sized: MiddlewareHandler = async (c, next) => (c.req.path === "/sized" ? c.body("12345", 200, {"content-length": "5"}) : next())
const plain: MiddlewareHandler = async (c, next) => (c.req.path === "/plain" ? c.body("text") : next())
const boom: MiddlewareHandler = async (c, next) => (c.req.path === "/boom" ? Promise.reject(new Error("boom")) : next())

describe(TITLE, () => {
    it("logs one line per response, in morgan's tiny format", async () => {
        const stderr = createBufWriter()
        const log = logger({stderr})
        await run([log, sized, plain, boom], "http://127.0.0.1/sized")
        await run([log, sized, plain, boom], "http://127.0.0.1/plain?q=1")
        await run([log, sized, plain, boom], "http://127.0.0.1/missing")
        await run([log, sized, plain, boom], "http://127.0.0.1/boom")
        const lines = stderr.read().split(NEWLINE)
        assert.match(lines.shift()!, /^GET \/sized 200 5 - \d+\.\d+ ms\n$/)
        assert.match(lines.shift()!, /^GET \/plain\?q=1 200 - - \d+\.\d+ ms\n$/)
        assert.match(lines.shift()!, /^GET \/missing 404 0 - \d+\.\d+ ms\n$/)
        assert.match(lines.shift()!, /^GET \/boom 500 0 - \d+\.\d+ ms\n$/)
        assert.equal(lines.length, 0)
    })

    it("keeps the 4xx and 5xx lines alone under quiet", async () => {
        const stderr = createBufWriter()
        const log = logger({stderr, quiet: true})
        await run([log, sized, plain, boom], "http://127.0.0.1/sized")
        await run([log, sized, plain, boom], "http://127.0.0.1/missing")
        await run([log, sized, plain, boom], "http://127.0.0.1/boom")
        const lines = stderr.read().split(NEWLINE)
        assert.match(lines.shift()!, /^GET \/missing 404 0 - /)
        assert.match(lines.shift()!, /^GET \/boom 500 0 - /)
        assert.equal(lines.length, 0)
    })
})
