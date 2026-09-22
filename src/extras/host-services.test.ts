import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {createHostServices} from "./host-services.ts"

const TITLE = "extras/host-services.test.ts"

describe(TITLE, () => {
    it("carries the first begin and end payloads", async () => {
        const services = createHostServices()
        const payload = {name: "page"}
        const result = {success: true}
        services.begin(payload)
        services.begin({name: "late"})
        services.end(result)
        services.end({success: false})
        assert.equal(await services.beginning, payload)
        assert.equal(await services.ending, result)
    })

    it("runs cleanup once, in registration order", async () => {
        const services = createHostServices()
        const calls: number[] = []
        services.cleanups.add(async () => {
            calls.push(1)
            await Promise.resolve()
            calls.push(2)
        })
        services.cleanups.add(() => void calls.push(3))
        const cleaning = services.cleanup()
        assert.equal(services.cleanup(), cleaning)
        await cleaning
        await services.cleanup()
        assert.deepEqual(calls, [1, 2, 3])
    })

    it("takes the first resolution after cleanup", async () => {
        const services = createHostServices()
        const calls: string[] = []
        services.cleanups.add(() => void calls.push("cleanup"))
        services.resolve(7)
        services.reject(new Error("late"))
        assert.equal(await services.finished, 7)
        assert.deepEqual(calls, ["cleanup"])
    })

    it("takes the first rejection after cleanup", async () => {
        const services = createHostServices()
        const error = new Error("first")
        const calls: string[] = []
        services.cleanups.add(() => void calls.push("cleanup"))
        services.reject(error)
        services.resolve(7)
        await assert.rejects(services.finished, reason => reason === error)
        assert.deepEqual(calls, ["cleanup"])
    })
})
