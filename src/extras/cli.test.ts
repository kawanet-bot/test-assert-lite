import {strict as assert} from "node:assert"
import {createServer} from "node:net"
import {describe, it} from "node:test"
import {fileURLToPath} from "node:url"
import {CLI} from "./cli.ts"

const suite = fileURLToPath(new URL("../../browser/tests/bundled.mjs", import.meta.url))

// What --serve leaves behind once it has failed: a watch still open would
// keep the process up. A closed one leaves the count a beat later.
const watching = async (): Promise<number> => {
    await new Promise(next => setTimeout(next, 50))
    return process.getActiveResourcesInfo().filter(name => name === "FSEventWrap").length
}

describe("extras/cli", () => {
    it("leaves no watch behind on a --port it cannot take, though --serve would watch", async () => {
        const before = await watching()
        assert.equal(await CLI({args: ["--serve", "--port", "invalid", suite]}), 1)
        assert.equal(await watching(), before)
    })

    it("leaves no watch behind when the port asked for is taken", async () => {
        const taken = createServer()
        await new Promise<void>(listening => taken.listen(0, "127.0.0.1", listening))
        const address = taken.address()
        const port = typeof address === "object" && address != null ? address.port : 0
        const before = await watching()
        try {
            await assert.rejects(CLI({args: ["--serve", "--port", String(port), suite]}), /EADDRINUSE/)
            assert.equal(await watching(), before)
        } finally {
            taken.close()
        }
    })
})
