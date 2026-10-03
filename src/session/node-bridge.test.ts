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
        const bridge = nodeBridge({stdout, stderr})
        bridge.stdout.write("out\n")
        bridge.stderr.write("err\n")
        assert.equal(stdout.read(), "out\n")
        assert.equal(stderr.read(), "err\n")
    })

    it("leaves the exit code alone on success, and sets 1 on a failed verdict", () => {
        const passed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        const seen: (Error | null)[] = []
        const bridge = nodeBridge(passed)
        bridge.send({type: "session:begin"}, error => seen.push(error))
        bridge.send({type: "session:end", data: {success: true}}, error => seen.push(error))
        assert.equal(passed.exitCode, undefined)
        assert.deepEqual(seen, [null, null])

        const failed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        nodeBridge(failed).send({type: "session:end", data: {success: false}})
        assert.equal(failed.exitCode, 1)
    })

    it("leaves the exit code to a caller who reads the verdict", () => {
        const attended: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        nodeBridge(attended, () => false).send({type: "session:end", data: {success: false}})
        assert.equal(attended.exitCode, undefined)
    })

    it("has nothing to disconnect", () => {
        const bridge = nodeBridge({stdout: createBufWriter(), stderr: createBufWriter()})
        assert.equal(bridge.disconnect(), undefined)
    })
})
