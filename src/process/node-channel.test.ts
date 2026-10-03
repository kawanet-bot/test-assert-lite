import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createBufWriter} from "../utils/buf-writer.ts"
import type {ProcessLike} from "./node-channel.ts"
import {nodeChannel} from "./node-channel.ts"

const TITLE = "process/node-channel.test.ts"

describe(TITLE, () => {
    it("writes to the process's streams", () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const channel = nodeChannel({stdout, stderr}, true)
        channel.stdout.write("out\n")
        channel.stderr.write("err\n")
        assert.equal(stdout.read(), "out\n")
        assert.equal(stderr.read(), "err\n")
    })

    it("takes every event and calls back, and a failed verdict of an auto session sets the exit code", () => {
        const passed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        const seen: (Error | null)[] = []
        const channel = nodeChannel(passed, true)
        channel.send({type: "session:begin"}, error => seen.push(error))
        channel.send({type: "session:end", data: {success: true}}, error => seen.push(error))
        assert.equal(passed.exitCode, undefined)
        assert.deepEqual(seen, [null, null])

        const failed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        nodeChannel(failed, true).send({type: "session:end", data: {success: false}})
        assert.equal(failed.exitCode, 1)
    })

    it("leaves the exit code to the caller who opened the session", () => {
        const opened: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        nodeChannel(opened, false).send({type: "session:end", data: {success: false}})
        assert.equal(opened.exitCode, undefined)
    })

    it("has nothing to disconnect", () => {
        const channel = nodeChannel({stdout: createBufWriter(), stderr: createBufWriter()}, true)
        assert.equal(channel.disconnect(), undefined)
    })
})
