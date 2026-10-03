import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {createBufWriter} from "../utils/buf-writer.ts"
import {withExitCode} from "./exit-code.ts"
import type {ProcessLike} from "./node-channel.ts"

const TITLE = "process/exit-code.test.ts"

describe(TITLE, () => {
    it("passes the streams and the events through, and keeps the channel open", () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const sent: string[] = []
        let disconnected = 0
        const inner: TAL.Channel = {
            stdout,
            stderr,
            send: (message, callback) => {
                sent.push(message.type)
                callback?.(null)
            },
            disconnect: () => {
                disconnected++
            },
        }
        const seen: (Error | null)[] = []
        const channel = withExitCode(inner, null)
        channel.stdout.write("out\n")
        channel.stderr.write("err\n")
        channel.send({type: "session:begin"}, error => seen.push(error))
        channel.send({type: "session:end", data: {success: false}}, error => seen.push(error))
        channel.disconnect()
        assert.equal(stdout.read(), "out\n")
        assert.equal(stderr.read(), "err\n")
        assert.deepEqual(sent, ["session:begin", "session:end"])
        assert.deepEqual(seen, [null, null])
        assert.equal(disconnected, 0)
    })

    it("leaves the exit code on the process given, for a failed verdict alone", () => {
        const inner: TAL.Channel = {stdout: createBufWriter(), stderr: createBufWriter(), send: (_, callback) => callback?.(null), disconnect: () => undefined}
        const passed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        withExitCode(inner, passed).send({type: "session:end", data: {success: true}})
        assert.equal(passed.exitCode, undefined)
        const failed: ProcessLike = {stdout: createBufWriter(), stderr: createBufWriter()}
        withExitCode(inner, failed).send({type: "session:end", data: {success: false}})
        assert.equal(failed.exitCode, 1)
    })
})
