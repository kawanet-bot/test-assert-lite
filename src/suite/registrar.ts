import type * as declared from "test-assert-lite"
import type {HarnessState} from "../session/state.ts"
import type {Args} from "./declare.ts"
import {nameOf, normalize} from "./declare.ts"

type TestFn = declared.TAL.TestFn
type SuiteFn = declared.TAL.SuiteFn

interface Registrar {
    suite: declared.TAL.SuiteAPI
    test: declared.TAL.TestAPI
    before: declared.TAL.RegistrarAPI["before"]
    after: declared.TAL.RegistrarAPI["after"]
}

// Binds the four registration functions to one state. A declaration at
// the root is what starts the walk, as under node:test, so each of them
// tells the scheduler.
export const createRegistrar = (state: HarnessState, schedule: () => void): Registrar => {
    const fromTestBody = (): boolean => state.openBodies > 0 && state.openSuites === 0

    const suiteBase: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        if (fromTestBody()) throw new Error("describe() cannot be called from inside a test body")
        const {name, options, fn} = normalize<SuiteFn>(args)
        state.current.declareSuite(nameOf(name, fn), options, fn)
        if (state.current === state.root) schedule()
    }

    const suiteSkip: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        const {name, options, fn} = normalize<SuiteFn>(args)
        return suiteBase(name, {...options, skip: true}, fn)
    }

    const suiteTodo: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        const {name, options, fn} = normalize<SuiteFn>(args)
        return suiteBase(name, {...options, todo: true}, fn)
    }

    const suite: declared.TAL.SuiteAPI = Object.assign(suiteBase, {skip: suiteSkip, todo: suiteTodo})

    const testBase: declared.TAL.TestBase = (...args: Args<TestFn>) => {
        if (fromTestBody()) throw new Error("it() cannot be called from inside a test body; use t.test() instead")
        const {name, options, fn} = normalize<TestFn>(args)
        state.current.declareTest(nameOf(name, fn), options, fn)
        if (state.current === state.root) schedule()
    }

    const testSkip: declared.TAL.TestBase = (...args: Args<TestFn>) => {
        const {name, options, fn} = normalize<TestFn>(args)
        return testBase(name, {...options, skip: true}, fn)
    }

    const testTodo: declared.TAL.TestBase = (...args: Args<TestFn>) => {
        const {name, options, fn} = normalize<TestFn>(args)
        return testBase(name, {...options, todo: true}, fn)
    }

    const test: declared.TAL.TestAPI = Object.assign(testBase, {skip: testSkip, todo: testTodo})

    // A hook belongs to the suite that declares it. before runs once when
    // that suite starts, after once everything below it has finished,
    // grandchildren included.
    const before: declared.TAL.RegistrarAPI["before"] = (fn) => {
        if (fromTestBody()) throw new Error("before() cannot be called from inside a test body")
        state.current.before.push(fn)
        if (state.current === state.root) schedule()
    }

    const after: declared.TAL.RegistrarAPI["after"] = (fn) => {
        if (fromTestBody()) throw new Error("after() cannot be called from inside a test body")
        state.current.after.push(fn)
        if (state.current === state.root) schedule()
    }

    return {suite, test, before, after}
}
