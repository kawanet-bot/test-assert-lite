// The page's side of the channel, without a network: what the session
// posts, in what order, and with what verdict.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {createTAL} from "../index.ts"

const TITLE = "session/client.test.ts"

const testStub = () => {
    const pathLog: string[] = []
    const bodyLog: string[] = []

    // Keeps each request in arrival order.
    const fetch: TAL.FetchLike = async (path, init) => {
        pathLog.push(path)
        bodyLog.push(init.body)
    }

    const output = () => undefined

    return {pathLog, bodyLog, fetch, output}
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

const SUCCESS = JSON.stringify({success: true})
const FAILURE = JSON.stringify({success: false})

describe(TITLE, () => {
    it("posts begin first, then the streams, then end, in order", async () => {
        const {session} = createTAL()
        const {pathLog, bodyLog, fetch, output} = testStub()
        session.session({fetch, output})
        session.stdout.write("one\n")
        session.stderr.write("warned\n")
        session.stdout.write("two\n")
        await session.end()
        assert.deepEqual(pathLog, [
            "begin",
            "stdout",
            "stderr",
            "end",
        ])
        assert.equal(bodyLog[1], "one\ntwo\n")
        assert.equal(bodyLog[2], "warned\n")
        assert.equal(bodyLog[3], SUCCESS)
    })

    it("gathers a burst of lines into one request per stream", async () => {
        const {session} = createTAL()
        const {pathLog, bodyLog, fetch, output} = testStub()
        session.session({fetch, output})
        for (let i = 0; i < 100; i++) session.stdout.write(`line ${i}\n`)
        await session.end()
        assert.deepEqual(pathLog, ["begin", "stdout", "end"])
        assert.equal((bodyLog[1] ?? "").split("\n").length - 1, 100)
        assert.equal(bodyLog[2], SUCCESS)
    })

    it("flushes on its own while the run goes on", async () => {
        const {session} = createTAL()
        const {pathLog, bodyLog, fetch, output} = testStub()
        session.session({fetch, output})
        session.stdout.write("early\n")
        await sleep(200)
        assert.deepEqual(pathLog, ["begin", "stdout"])
        assert.deepEqual(bodyLog, ["", "early\n"])
        session.stdout.write("late\n")
        await session.end()
        assert.equal(pathLog.length, 4)
        assert.equal(bodyLog.length, 4)
        assert.equal(bodyLog[2], "late\n")
    })

    it("sends the run's verdict: false once a test failed", async () => {
        const {session, test} = createTAL()
        const {bodyLog, fetch, output} = testStub()
        session.session({fetch, output})
        test.it("fails", () => {
            throw new Error("no")
        })
        await session.end()
        assert.equal(bodyLog.at(-1), FAILURE)
    })

    it("sends text as given", async () => {
        const {session} = createTAL()
        const {bodyLog, fetch, output} = testStub()
        session.session({fetch, output})
        session.stderr.write("as ")
        session.stderr.write("given\n")
        await session.end()
        const lines = (bodyLog[1] ?? "").split("\n")
        assert.equal(lines[0], "as given")
    })

    it("text written before session() goes out once the session is open", async () => {
        const {session} = createTAL()
        const {pathLog, bodyLog, fetch, output} = testStub()
        session.stdout.write("early\n")
        session.stderr.write("warned\n")
        session.session({fetch, output})
        await session.end()
        assert.deepEqual(pathLog, ["begin", "stdout", "stderr", "end"])
        assert.deepEqual(bodyLog, ["", "early\n", "warned\n", SUCCESS])
    })

    it("does not reject when the fetch does", async () => {
        const {session} = createTAL()
        const {output} = testStub()
        const fetch: TAL.FetchLike = async () => {
            throw new TypeError("fetch failed")
        }
        session.session({fetch, output})
        session.stdout.write("lost\n")
        assert.equal((await session.end()).success, true)
    })

    it("text written after end() waits for the next session", async () => {
        const {session} = createTAL()
        const {pathLog, bodyLog, fetch, output} = testStub()
        session.session({fetch, output})
        await session.end()
        session.stdout.write("later\n")
        assert.equal(pathLog.length, 2)
        assert.equal(bodyLog.length, 2)
        session.session({fetch, output})
        await session.end()
        assert.deepEqual(pathLog.slice(2), ["begin", "stdout", "end"])
        assert.deepEqual(bodyLog.slice(2), ["", "later\n", SUCCESS])
    })

    // A console of the test's own stands in for the page's.
    it("takes a console: log to stdout, error to stderr, a call a line, and gives it back at the end", async () => {
        const {pathLog, bodyLog, fetch, output} = testStub()
        const fake = {
            debug: (..._: unknown[]) => undefined,
            log: (..._: unknown[]) => undefined,
            info: (..._: unknown[]) => undefined,
            warn: (..._: unknown[]) => undefined,
            error: (..._: unknown[]) => undefined,
        }
        const {log, warn} = fake
        const {session} = createTAL()
        session.session({fetch, output, console: fake})
        assert.notEqual(fake.log, log)
        fake.log("a", 1, "b")
        fake.info("info")
        fake.debug("debug")
        fake.warn("warned")
        fake.error(new TypeError("typed"))
        await session.end()
        assert.equal(fake.log, log)
        assert.equal(fake.warn, warn)
        assert.equal(pathLog[1], "stdout")
        assert.equal(bodyLog[1], "a 1 b\ninfo\ndebug\n")
        assert.equal(pathLog[2], "stderr")
        const lines = (bodyLog[2] ?? "").split("\n")
        assert.equal(lines[0], "warned")
        assert.match(lines[1] ?? "", /^TypeError: typed/)
    })
})
