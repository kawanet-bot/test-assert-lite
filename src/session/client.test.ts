import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {createTAL} from "../index.ts"

const TITLE = "session/client.test.ts"

// The page's side of the channel, without a network: what the session
// posts, in what order, and with what verdict.

const seen: {path: string, body: string}[] = []

// Keeps each request in arrival order. A request to the run that is gone fails.
const stub: TAL.FetchLike = async (path, init) => {
    seen.push({path, body: init.body})
}

// A harness per session, since a session stays open until its end(); the
// report itself is kept off the channel, so what is seen is what is sent.
const connect = () => {
    const local = createTAL()
    local.session.session({fetch: stub, output: () => undefined})
    return {...local.session, it: local.test.it}
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe(TITLE, () => {
    it("posts begin first, then the streams, then end, in order", async () => {
        seen.length = 0
        const client = connect()
        client.stdout.write("one\n")
        client.stderr.write("warned\n")
        client.stdout.write("two\n")
        await client.end()
        assert.deepEqual(seen.map(({path}) => path), [
            "begin",
            "stdout",
            "stderr",
            "end",
        ])
        assert.equal(seen[1]?.body, "one\ntwo\n")
        assert.equal(seen[2]?.body, "warned\n")
        assert.equal(seen[3]?.body, "true")
    })

    it("gathers a burst of lines into one request per stream", async () => {
        seen.length = 0
        const client = connect()
        for (let i = 0; i < 100; i++) client.stdout.write(`line ${i}\n`)
        await client.end()
        assert.deepEqual(seen.map(({path}) => path), ["begin", "stdout", "end"])
        assert.equal((seen[1]?.body ?? "").split("\n").length - 1, 100)
        assert.equal(seen[2]?.body, "true")
    })

    it("flushes on its own while the run goes on", async () => {
        seen.length = 0
        const client = connect()
        client.stdout.write("early\n")
        await sleep(200)
        assert.deepEqual(seen.map(({path, body}) => `${path} ${JSON.stringify(body)}`), ['begin ""', 'stdout "early\\n"'])
        client.stdout.write("late\n")
        await client.end()
        assert.equal(seen.length, 4)
        assert.equal(seen[2]?.body, "late\n")
    })

    it("sends the run's verdict: false once a test failed", async () => {
        seen.length = 0
        const client = connect()
        client.it("fails", () => {
            throw new Error("no")
        })
        await client.end()
        assert.equal(seen.at(-1)?.body, "false")
    })

    it("sends text as given, and an Error as its text with a newline", async () => {
        seen.length = 0
        const client = connect()
        client.stderr.write("as ")
        client.stderr.write("given\n")
        client.stderr.write(new TypeError("typed"))
        await client.end()
        const lines = (seen[1]?.body ?? "").split("\n")
        assert.equal(lines[0], "as given")
        assert.match(lines[1] ?? "", /^TypeError: typed/)
        assert.equal(seen[1]?.body.endsWith("\n"), true)
    })

    it("text written before session() goes out once the session is open", async () => {
        seen.length = 0
        const local = createTAL()
        local.session.stdout.write("early\n")
        local.session.stderr.write("warned\n")
        local.session.session({fetch: stub, output: () => undefined})
        await local.session.end()
        assert.deepEqual(seen.map(({path, body}) => `${path} ${JSON.stringify(body)}`), [
            'begin ""',
            'stdout "early\\n"',
            'stderr "warned\\n"',
            'end "true"',
        ])
    })

    it("text written after end() waits for the next session", async () => {
        seen.length = 0
        const local = createTAL()
        local.session.session({fetch: stub, output: () => undefined})
        await local.session.end()
        local.session.stdout.write("later\n")
        assert.equal(seen.length, 2)
        local.session.session({fetch: stub, output: () => undefined})
        await local.session.end()
        assert.deepEqual(seen.slice(2).map(({path, body}) => `${path} ${JSON.stringify(body)}`), [
            'begin ""',
            'stdout "later\\n"',
            'end "true"',
        ])
    })

    // A console of the test's own stands in for the page's.
    it("takes a console: log to stdout, error to stderr, a call a line, and gives it back at the end", async () => {
        seen.length = 0
        const fake = {
            debug: (..._: unknown[]) => undefined,
            log: (..._: unknown[]) => undefined,
            info: (..._: unknown[]) => undefined,
            warn: (..._: unknown[]) => undefined,
            error: (..._: unknown[]) => undefined,
        }
        const {log, warn} = fake
        const local = createTAL()
        local.session.session({fetch: stub, output: () => undefined, console: fake})
        assert.notEqual(fake.log, log)
        fake.log("a", 1, "b")
        fake.info("info")
        fake.debug("debug")
        fake.warn("warned")
        fake.error(new TypeError("typed"))
        await local.session.end()
        assert.equal(fake.log, log)
        assert.equal(fake.warn, warn)
        assert.equal(seen[1]?.path, "stdout")
        assert.equal(seen[1]?.body, "a 1 b\ninfo\ndebug\n")
        assert.equal(seen[2]?.path, "stderr")
        const lines = (seen[2]?.body ?? "").split("\n")
        assert.equal(lines[0], "warned")
        assert.match(lines[1] ?? "", /^TypeError: typed/)
    })
})
