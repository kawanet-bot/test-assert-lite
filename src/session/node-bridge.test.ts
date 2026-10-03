import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createBufWriter} from "../utils/buf-writer.ts"
import type {ProcessLike} from "./node-bridge.ts"
import {nodeBridge} from "./node-bridge.ts"

const TITLE = "session/node-bridge.test.ts"

describe(TITLE, () => {
    it("writes to the process's streams", () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const bridge = nodeBridge({stdout, stderr}, true)
        bridge.stdout.write("out\n")
        bridge.stderr.write("err\n")
        assert.equal(stdout.read(), "out\n")
        assert.equal(stderr.read(), "err\n")
    })

    it("takes every event and calls back, and a failed verdict of an auto session sets the exit code", () => {
        const passed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        const seen: (Error | null)[] = []
        const bridge = nodeBridge(passed, true)
        bridge.send({type: "session:begin"}, error => seen.push(error))
        bridge.send({type: "session:end", data: {success: true}}, error => seen.push(error))
        assert.equal(passed.exitCode, undefined)
        assert.deepEqual(seen, [null, null])

        const failed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        nodeBridge(failed, true).send({type: "session:end", data: {success: false}})
        assert.equal(failed.exitCode, 1)
    })

    it("leaves the exit code to the caller who opened the session", () => {
        const opened: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        nodeBridge(opened, false).send({type: "session:end", data: {success: false}})
        assert.equal(opened.exitCode, undefined)
    })

    it("has nothing to disconnect", () => {
        const bridge = nodeBridge({stdout: createBufWriter(), stderr: createBufWriter()}, true)
        assert.equal(bridge.disconnect(), undefined)
    })
})
