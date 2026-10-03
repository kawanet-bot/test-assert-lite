// The page's side of the channel, without a network: what the session
// posts, in what order, and with what verdict.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {createTAL} from "../index.ts"

const TITLE = "process/fetch-channel.test.ts"

const NEWLINE = /(?<=\n)(?=\S)/

type FetchLike = (url: string, init: {method: "POST", body: string}) => Promise<{ok: boolean}>

const testStub = (proc: TAL.ProcessAPI, stubFetch?: FetchLike) => {
    const logs: [string, string][] = []

    stubFetch ??= async (path, init) => {
        logs.push([path, init.body])
        return {ok: true}
    }

    const channel = proc.connect({fetch: stubFetch as typeof fetch})

    const output = () => undefined

    return {logs, channel, output}
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// A send as logged, with the session left out: what was sent and the verdict.
const kind = (log: [string, string] | undefined): [string, string, boolean | undefined] | undefined => {
    if (log == null) return undefined
    const message = JSON.parse(log[1]) as TAL.SessionEvent
    return [log[0], message.type, "data" in message ? message.data.success : undefined]
}

const BEGIN: [string, string, boolean | undefined] = ["send", "session:begin", undefined]
const SUCCESS: [string, string, boolean | undefined] = ["send", "session:end", true]
const FAILURE: [string, string, boolean | undefined] = ["send", "session:end", false]

describe(TITLE, {timeout: 1000}, () => {
    it("posts begin first, then the streams, then end, in order", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        session.session({channel, output})
        channel.stdout.write("one\n")
        channel.stderr.write("warned\n")
        channel.stdout.write("two\n")
        await session.run()

        assert.deepEqual(kind(logs.shift()), BEGIN)
        assert.deepEqual(logs.shift(), ["stdout", "one\n"])
        assert.deepEqual(logs.shift(), ["stderr", "warned\n"])
        assert.deepEqual(logs.shift(), ["stdout", "two\n"])
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("gathers a burst of lines into one request per stream", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        session.session({channel, output})
        for (let i = 0; i < 100; i++) channel.stdout.write(`line ${i}\n`)
        await session.run()

        assert.deepEqual(kind(logs.shift()), BEGIN)
        const [type, body] = logs.shift()!
        assert.equal(type, "stdout")
        const lines = body.split(NEWLINE) ?? []
        assert.equal(lines.length, 100)
        assert.equal(lines.at(0), "line 0\n")
        assert.equal(lines.at(-1), "line 99\n")
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("flushes on its own while the run goes on", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        session.session({channel, output})
        channel.stdout.write("early\n")
        await sleep(200)
        assert.deepEqual(kind(logs.shift()), BEGIN)
        assert.deepEqual(logs.shift(), ["stdout", "early\n"])
        assert.equal(logs.length, 0)

        channel.stdout.write("late\n")
        await session.run()
        assert.deepEqual(logs.shift(), ["stdout", "late\n"])
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("sends the run's verdict: false once a test failed", async () => {
        const {session, test, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        session.session({channel, output})
        test.it("fails", () => {
            throw new Error("no")
        })
        await session.run()
        assert.deepEqual(kind(logs.at(-1)), FAILURE)
    })

    it("sends text as given", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        session.session({channel, output})
        channel.stderr.write("as ")
        channel.stderr.write("given\n")
        await session.run()

        assert.deepEqual(kind(logs.shift()), BEGIN)
        assert.deepEqual(logs.shift(), ["stderr", "as given\n"]) // combined
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("text written before session() goes out once the session is open", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        channel.stdout.write("early\n")
        channel.stderr.write("warned\n")
        session.session({channel, output})
        await session.run()

        assert.deepEqual(logs.shift(), ["stdout", "early\n"])
        assert.deepEqual(logs.shift(), ["stderr", "warned\n"])
        assert.deepEqual(kind(logs.shift()), BEGIN)
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("does not reject when the fetch does", async () => {
        const {session, proc} = createTAL()
        const {channel, output} = testStub(proc, async () => {
            throw new TypeError("fetch failed")
        })
        session.session({channel, output})
        channel.stdout.write("lost\n")
        channel.stderr.write("still lost\n")
        assert.equal((await session.run()).success, true)
    })

    it("takes the arguments on connect(), into the array a script already holds", () => {
        const {proc} = createTAL()
        const held = proc.argv
        proc.connect({fetch: (async () => ({ok: true})) as unknown as typeof fetch, argv: ["test-assert", "/suite.mjs", "one"]})
        assert.deepEqual(held, ["test-assert", "/suite.mjs", "one"])
        assert.equal(createTAL().proc.argv, held)
        proc.connect({fetch: (async () => ({ok: true})) as unknown as typeof fetch})
        assert.deepEqual(held, ["test-assert", "/suite.mjs", "one"])
    })

    it("takes what a script writes to proc, from any harness, once connected", async () => {
        const {session, proc} = createTAL()
        const {logs, output} = testStub(proc)
        proc.stdout.write("script out\n")
        createTAL().proc.stderr.write("script err\n")
        session.session({output})
        await session.run()

        assert.deepEqual(logs.shift(), ["stdout", "script out\n"])
        assert.deepEqual(logs.shift(), ["stderr", "script err\n"])
        assert.deepEqual(kind(logs.shift()), BEGIN)
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("calls the channel's disconnect once, after the result", async () => {
        const {session, test} = createTAL()
        const sent: string[] = []
        let disconnected = 0
        const channel: TAL.Channel = {
            stdout: {write: () => undefined},
            stderr: {write: () => undefined},
            send: (message, callback) => {
                sent.push(message.type)
                callback?.(null)
            },
            disconnect: () => {
                disconnected++
            },
        }
        session.session({channel, output: () => undefined})
        test.it("one", () => undefined)
        await session.run()

        assert.deepEqual(sent, ["session:begin", "session:end"])
        assert.equal(disconnected, 1)
    })

    // A console of the test's own stands in for the page's.
    it("takes a console: log to stdout, error to stderr, a call a line, and gives it back at the end", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        const fake = {
            debug: (..._: unknown[]) => undefined,
            log: (..._: unknown[]) => undefined,
            info: (..._: unknown[]) => undefined,
            warn: (..._: unknown[]) => undefined,
            error: (..._: unknown[]) => undefined,
        }
        const {log, warn} = fake
        session.session({channel, output, console: fake})
        assert.notEqual(fake.log, log)
        fake.log("a", 1, "b")
        fake.info("info")
        fake.debug("debug")
        fake.warn("warned")
        fake.error(new TypeError("typed"))
        await session.run()
        assert.equal(fake.log, log)
        assert.equal(fake.warn, warn)

        assert.deepEqual(kind(logs.shift()), BEGIN)
        assert.deepEqual(logs.shift(), ["stdout", "a 1 b\ninfo\ndebug\n"])
        const [type, body] = logs.shift()!
        assert.equal(type, "stderr")
        const lines = body?.split(NEWLINE)
        assert.equal(lines.shift(), "warned\n")
        assert.match(lines.shift()!, /^TypeError: typed/)
        assert.deepEqual(kind(logs.shift()), SUCCESS)
        assert.equal(logs.length, 0)
    })

    it("writes a heartbeat to stderr at the interval given, while quiet", async () => {
        const {session, proc} = createTAL()
        const {logs, channel, output} = testStub(proc)
        session.session({channel, output, heartbeat: 20})

        for (let i = 0; i < 10; i++) {
            await sleep(20)
            if (logs.length > 1) break
        }
        await session.run()
        assert.deepEqual(kind(logs.shift()), BEGIN)
        const [type, body] = logs.shift()!
        assert.equal(type, "stderr")
        assert.match(body!, /^⏳ \d+s\n/)
        assert.deepEqual(kind(logs.pop()), SUCCESS)
    })
})
