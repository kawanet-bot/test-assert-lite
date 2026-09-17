import type {TAL} from "test-assert-lite"
import type {HarnessState} from "../session/state.ts"
import type {Args} from "./declare.ts"
import {nameOf, normalize} from "./declare.ts"

type TestFn = TAL.TestFn
type SuiteFn = TAL.SuiteFn

// The declaring functions, bound to one state. A declaration at the root
// starts the walk, as under node:test, so each one tells the scheduler.
export const createRegistrar = (state: HarnessState, schedule: () => void): TAL.RegistrarAPI => {
    const fromTestBody = (): boolean => state.openBodies > 0 && state.openSuites === 0

    const suiteBase: TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        if (fromTestBody()) throw new Error("describe() cannot be called from inside a test body")
        const {name, options, fn} = normalize<SuiteFn>(args)
        state.current.declareSuite(nameOf(name, fn), options, fn)
        if (state.current === state.root) schedule()
    }

    const suiteSkip: TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        const {name, options, fn} = normalize<SuiteFn>(args)
        return suiteBase(name, {...options, skip: true}, fn)
    }

    const suiteTodo: TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        const {name, options, fn} = normalize<SuiteFn>(args)
        return suiteBase(name, {...options, todo: true}, fn)
    }

    const suite: TAL.SuiteAPI = Object.assign(suiteBase, {skip: suiteSkip, todo: suiteTodo})

    const testBase: TAL.TestBase = (...args: Args<TestFn>) => {
        if (fromTestBody()) throw new Error("it() cannot be called from inside a test body; use t.test() instead")
        const {name, options, fn} = normalize<TestFn>(args)
        state.current.declareTest(nameOf(name, fn), options, fn)
        if (state.current === state.root) schedule()
    }

    const testSkip: TAL.TestBase = (...args: Args<TestFn>) => {
        const {name, options, fn} = normalize<TestFn>(args)
        return testBase(name, {...options, skip: true}, fn)
    }

    const testTodo: TAL.TestBase = (...args: Args<TestFn>) => {
        const {name, options, fn} = normalize<TestFn>(args)
        return testBase(name, {...options, todo: true}, fn)
    }

    const test: TAL.TestAPI = Object.assign(testBase, {skip: testSkip, todo: testTodo})

    // A hook belongs to the suite that declares it. before runs once when
    // that suite starts, after once everything below it has finished,
    // grandchildren included.
    const before: TAL.RegistrarAPI["before"] = (fn) => {
        if (fromTestBody()) throw new Error("before() cannot be called from inside a test body")
        state.current.before.push(fn)
        if (state.current === state.root) schedule()
    }

    const after: TAL.RegistrarAPI["after"] = (fn) => {
        if (fromTestBody()) throw new Error("after() cannot be called from inside a test body")
        state.current.after.push(fn)
        if (state.current === state.root) schedule()
    }

    return {suite, test, before, after, describe: suite, it: test}
}
