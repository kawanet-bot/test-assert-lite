import {strict as assert} from "node:assert"
import type {Server} from "node:http"
import {createServer} from "node:http"
import {after, before, describe, it} from "node:test"
import {connect} from "./client.ts"

// What the CLI would see: each request's path and body, in arrival order.
const seen: {path: string, body: string}[] = []
let server: Server
let base: string

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

describe("client", () => {
    before(async () => {
        server = createServer((req, res) => {
            let body = ""
            req.setEncoding("utf8")
            req.on("data", chunk => (body += chunk))
            req.on("end", () => {
                seen.push({path: req.url ?? "", body})
                res.writeHead(204)
                res.end()
            })
        })
        await new Promise<void>(listening => server.listen(0, "127.0.0.1", listening))
        const address = server.address()
        const port = typeof address === "object" && address != null ? address.port : 0
        base = `http://127.0.0.1:${port}/@tal/run/abc/`
    })

    after(() => {
        server.close()
        server.closeAllConnections()
    })

    it("posts begin first, then the streams, then end, in order", async () => {
        seen.length = 0
        const client = connect(base)
        await client.begin()
        client.stdout("one\n")
        client.stderr("warned\n")
        client.stdout("two\n")
        await client.end(true)
        assert.deepEqual(seen.map(({path}) => path), [
            "/@tal/run/abc/begin",
            "/@tal/run/abc/stdout",
            "/@tal/run/abc/stderr",
            "/@tal/run/abc/end",
        ])
        assert.equal(seen[1]?.body, "one\ntwo\n")
        assert.equal(seen[2]?.body, "warned\n")
        assert.equal(seen[3]?.body, "true")
    })

    it("gathers a burst of lines into one request per stream", async () => {
        seen.length = 0
        const client = connect(base)
        for (let i = 0; i < 100; i++) client.stdout(`line ${i}\n`)
        await client.end(false)
        assert.deepEqual(seen.map(({path}) => path), ["/@tal/run/abc/stdout", "/@tal/run/abc/end"])
        assert.equal((seen[0]?.body ?? "").split("\n").length - 1, 100)
        assert.equal(seen[1]?.body, "false")
    })

    it("flushes on its own while the run goes on", async () => {
        seen.length = 0
        const client = connect(base)
        client.stdout("early\n")
        await sleep(200)
        assert.deepEqual(seen.map(({path, body}) => `${path} ${JSON.stringify(body)}`), ['/@tal/run/abc/stdout "early\\n"'])
        client.stdout("late\n")
        await client.end(true)
        assert.equal(seen.length, 3)
        assert.equal(seen[1]?.body, "late\n")
    })

    it("sends anything but true as a failure", async () => {
        seen.length = 0
        const client = connect(base)
        await client.end("yes" as unknown as boolean)
        assert.equal(seen[0]?.body, "false")
    })

    it("does not reject when nothing listens", async () => {
        const client = connect("http://127.0.0.1:9/@tal/run/none/")
        await client.begin()
        client.stdout("lost\n")
        await client.end(true)
    })
})
