// The channel on its own, without a network: each report of the page as
// a POST under the run's path.

import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {createBufWriter} from "../../utils/buf-writer.ts"
import {createChannel, type Channel} from "./channel.ts"
import {createContext} from "./middleware.ts"

const TITLE = "extras/server/channel.test.ts"

const nullWriter: TAL.Writer = {write: (() => undefined)}

const prefix = "/@tal/run/000000000/"
const otherPrefix = "/@tal/run/000000001/"

const post = async (channel: Channel, endpoint: string, body: string, method = "POST", path: string = prefix): Promise<number | "next" | undefined> => {
    const url = `http://127.0.0.1${path}${endpoint}`
    const c = createContext(new Request(url, {method, body: method === "POST" ? body : null}))
    let next: "next" | undefined = undefined
    const res = await channel.handler(c, async () => void (next = "next"))
    if (next) return next
    return res?.status
}

describe(TITLE, () => {
    it("has a path of its own, and takes each report by POST under it", async () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const run = createChannel({prefix, stdout, stderr})
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
        const run = createChannel({prefix, stdout: nullWriter, stderr: nullWriter})
        assert.equal(await post(run, "stdout", "", "GET"), 405)
        assert.equal(await post(run, "nothing", ""), "next")
        assert.equal(await post(run, "end", "true", "POST", otherPrefix), "next")
        run.close()
    })

    it("fails the verdict on anything but true, and still takes the streams after the end", async () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const run = createChannel({prefix, stdout, stderr})
        assert.equal(await post(run, "end", "yes"), 204)
        assert.equal(await run.done, false)
        assert.equal(await post(run, "stdout", "after end 1\n"), 204)
        assert.equal(await post(run, "stderr", "after end 2\n"), 204)
        assert.equal(stdout.read(), "after end 1\n")
        assert.equal(stderr.read(), "after end 2\n")
        run.close()
    })
})
