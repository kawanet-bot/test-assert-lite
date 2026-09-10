import {strict as assert} from "node:assert"
import {mkdtemp, rename, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {after, before, describe, it} from "node:test"
import {createContext} from "./middleware.ts"
import type {Watcher} from "./watch.ts"
import {createWatcher} from "./watch.ts"

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// The page's ask, without a network: GET /@tal/watch?after=<version>.
const ask = async (watcher: Watcher, after: number, method = "GET"): Promise<{status: number, body: string}> => {
    const c = createContext(new Request(`http://127.0.0.1/@tal/watch?after=${after}`, {method}))
    const res = await watcher.handler(c, async () => undefined)
    return {status: res?.status ?? 0, body: res == null ? "" : await res.text()}
}

describe("server/watch", () => {
    let dir: string
    let file: string
    let other: string
    let watcher: Watcher

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), "tal-watch-"))
        file = join(dir, "bundled.mjs")
        other = join(dir, "other.mjs")
        await writeFile(file, "v0")
        await writeFile(other, "v0")
        watcher = createWatcher([file], 300)
    })

    after(async () => {
        watcher.close()
        await rm(dir, {recursive: true, force: true})
    })

    it("holds an ask until the wait runs out, then answers 204", async () => {
        const started = Date.now()
        assert.deepEqual(await ask(watcher, 0), {status: 204, body: ""})
        assert.ok(Date.now() - started >= 250)
    })

    it("answers 200 with the version once the file changes, a burst as one", async () => {
        const pending = ask(watcher, 0)
        await sleep(50)
        for (let i = 1; i <= 5; i++) {
            await writeFile(file, `v${i}`)
            await sleep(5)
        }
        assert.deepEqual(await pending, {status: 200, body: "1"})
        assert.equal(watcher.version, 1)
        assert.deepEqual(await ask(watcher, 0), {status: 200, body: "1"})
        assert.equal((await ask(watcher, 1)).status, 204)
    })

    it("sees a file saved by a rename over it, and again after that", async () => {
        await writeFile(join(dir, ".tmp"), "renamed")
        await rename(join(dir, ".tmp"), file)
        assert.equal((await ask(watcher, 1)).status, 200)
        await writeFile(file, "after the rename")
        assert.deepEqual(await ask(watcher, 2), {status: 200, body: "3"})
    })

    it("ignores another file in the directory", async () => {
        await writeFile(other, "v1")
        assert.equal((await ask(watcher, 3)).status, 204)
    })

    it("leaves another path to the next middleware, and refuses another method", async () => {
        const c = createContext(new Request("http://127.0.0.1/@tal/watching"))
        assert.equal(await watcher.handler(c, async () => undefined), undefined)
        assert.equal((await ask(watcher, 3, "POST")).status, 405)
    })

    it("releases a pending ask with 204 when closed", async () => {
        const closing = createWatcher([file], 10_000)
        const pending = ask(closing, closing.version)
        await sleep(50)
        closing.close()
        assert.equal((await pending).status, 204)
    })
})
