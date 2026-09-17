import {test, type TestContext} from "node:test"

const TITLE = "sample/typescript/typeof.test.ts"

test(TITLE, (c: TestContext) => {
    const bool: boolean = true
    const str: string = "hello"
    const num: number = 1
    const obj: object = {}
    const func: Function = (): void => undefined

    c.assert.equal(typeof bool, "boolean")
    c.assert.equal(typeof str, "string")
    c.assert.equal(typeof num, "number")
    c.assert.equal(typeof obj, "object")
    c.assert.equal(typeof func, "function")
})
