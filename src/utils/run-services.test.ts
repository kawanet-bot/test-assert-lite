import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createRunServices} from "./run-services.ts"

const TITLE = "utils/run-services.test.ts"

describe(TITLE, () => {
    it("runs cleanup once, in registration order", async () => {
        const services = createRunServices()
        const calls: number[] = []
        services.onCleanup(async () => {
            calls.push(1)
            await Promise.resolve()
            calls.push(2)
        })
        services.onCleanup(() => void calls.push(3))
        const cleaning = services.cleanup()
        assert.equal(services.cleanup(), cleaning)
        await cleaning
        await services.cleanup()
        assert.deepEqual(calls, [1, 2, 3])
    })

    // A cleanup added once cleanup has begun runs after the rest, and a
    // failure among them is written out rather than left unhandled.
    it("runs a cleanup added after cleanup began, and reports its failure", async () => {
        const said: string[] = []
        const services = createRunServices({stderr: {write: chunk => void said.push(chunk)}})
        const calls: string[] = []
        services.resolve({success: true})
        await services.finished
        services.onCleanup(() => void calls.push("late"))
        services.onCleanup(() => Promise.reject(new Error("late fails")))
        services.onCleanup(() => void calls.push("after"))
        await new Promise(resolve => setTimeout(resolve, 10))
        assert.deepEqual(calls, ["late", "after"])
        assert.deepEqual(said, ["Error: late fails\n"])
    })

    it("takes the first resolution after cleanup", async () => {
        const services = createRunServices()
        const calls: string[] = []
        services.onCleanup(() => void calls.push("cleanup"))
        services.resolve({success: true})
        services.reject(new Error("late"))
        assert.deepEqual(await services.finished, {success: true})
        assert.deepEqual(calls, ["cleanup"])
    })

    it("takes the first rejection after cleanup", async () => {
        const services = createRunServices()
        const error = new Error("first")
        const calls: string[] = []
        services.onCleanup(() => void calls.push("cleanup"))
        services.reject(error)
        services.resolve({success: true})
        await assert.rejects(services.finished, reason => reason === error)
        assert.deepEqual(calls, ["cleanup"])
    })
})
