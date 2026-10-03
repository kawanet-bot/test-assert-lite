import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createBufWriter} from "../utils/buf-writer.ts"
import {nodeChannel} from "./node-channel.ts"

const TITLE = "process/node-channel.test.ts"

describe(TITLE, () => {
    it("writes to the process's streams", () => {
        const stdout = createBufWriter()
        const stderr = createBufWriter()
        const channel = nodeChannel({stdout, stderr})
        channel.stdout.write("out\n")
        channel.stderr.write("err\n")
        assert.equal(stdout.read(), "out\n")
        assert.equal(stderr.read(), "err\n")
    })

    it("takes every event and calls back, and has nothing to disconnect", () => {
        const seen: (Error | null)[] = []
        const channel = nodeChannel({stdout: createBufWriter(), stderr: createBufWriter()})
        channel.send({type: "session:begin", session: "sessionAAA"}, error => seen.push(error))
        channel.send({type: "session:end", session: "sessionAAA", data: {success: true}}, error => seen.push(error))
        assert.deepEqual(seen, [null, null])
        assert.equal(channel.disconnect(), undefined)
    })
})
