// The page's side, without a network: a POST under the run's path.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {createBufWriter} from "../../utils/buf-writer.ts"
import {createChannel, type Channel} from "./channel.ts"
import {createContext} from "./middleware.ts"

const TITLE = "extras/server/channel.test.ts"

const nullWriter: TAL.Writer = {write: (() => undefined)}

const post = async (channel: Channel, endpoint: string, body: string, method = "POST"): Promise<number> => {
    const c = createContext(new Request(`http://127.0.0.1${channel.path}${endpoint}`, {method, body: method === "POST" ? body : null}))
    const res = await channel.handler(c, async () => undefined)
    return res?.status ?? 0
}

describe(TITLE, () => {
    it("has a path of its own, and takes each report by POST under it", async () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const run = createChannel({stdout, stderr})
        assert.match(run.path, /^\/@tal\/run\/[0-9a-z]{9}\/$/)
        assert.equal(await post(run, "begin", ""), 204)
        assert.equal(await post(run, "stdout", "one\n"), 204)
        assert.equal(await post(run, "stderr", "warned\n"), 204)
        assert.equal(await post(run, "end", "true"), 204)
        assert.equal(stdout.read(), "one\n")
        assert.equal(stderr.read(), "warned\n")
        assert.equal(await run.done, true)
        run.close()
    })

    it("leaves another path to the next middleware, and refuses another method", async () => {
        const run = createChannel({stdout: nullWriter, stderr: nullWriter})
        assert.equal(await post(run, "stdout", "", "GET"), 405)
        assert.equal(await post(run, "nothing", ""), 0)
        assert.equal(await post({...run, path: "/@tal/run/000000000/"}, "end", "true"), 0)
        run.close()
    })

    it("fails the verdict on anything but true, and takes nothing after the end", async () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const run = createChannel({stdout, stderr})
        assert.equal(await post(run, "end", "yes"), 204)
        assert.equal(await run.done, false)
        assert.equal(await post(run, "stdout", "after end 1\n"), 204)
        assert.equal(await post(run, "stderr", "after end 2\n"), 204)
        assert.equal(stdout.read(), "after end 1\n")
        assert.equal(stderr.read(), "after end 2\n")
        run.close()
    })

    it("runs of its own do not share a path", () => {
        const a = createChannel()
        const b = createChannel()
        assert.notEqual(a.path, b.path)
        a.close()
        b.close()
    })
})
