import type * as declared from "test-assert-lite"
import type {Args} from "./tester.ts"
import {Test, nameOf, normalize} from "./tester.ts"

type TestFn = declared.TAL.TestFn
type SuiteFn = declared.TAL.SuiteFn

// The registration state of one harness: the tree declared so far and the
// suite whose body is running, which is where a declaration lands. Wrapping
// it in a factory lets the self-tests build an isolated tree.
export interface HarnessState {
    root: Test
    current: Test
    // Test bodies not yet settled, a timed out one included. While any is
    // open the declaration API is closed, as it is from inside a body: a
    // declaration from such a body would land in a later run otherwise.
    openBodies: number
}

const makeRoot = (): Test => new Test("suite", "", {}, undefined, null)

export const createHarnessState = (): HarnessState => {
    const root = makeRoot()
    return {root, current: root, openBodies: 0}
}

export const resetHarnessState = (state: HarnessState): void => {
    state.root = makeRoot()
    state.current = state.root
}

interface Registrar {
    suite: declared.TAL.SuiteAPI
    test: declared.TAL.TestAPI
    before: typeof declared.before
    after: typeof declared.after
}

// Binds the four registration functions to one state. Each of them only
// reads current, so the four of them close over exactly what they need.
export const createRegistrar = (state: HarnessState): Registrar => {
    const suiteBase: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        if (state.openBodies) throw new Error("describe() cannot be called from inside a test body")
        const {name, options, fn} = normalize<SuiteFn>(args)
        state.current.declare("suite", nameOf(name, fn), options, fn)
    }

    const suiteSkip: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        const {name, options, fn} = normalize<SuiteFn>(args)
        return suiteBase(name, {...options, skip: true}, fn)
    }

    const suite: declared.TAL.SuiteAPI = Object.assign(suiteBase, {skip: suiteSkip})

    const testBase: declared.TAL.TestBase = (...args: Args<TestFn>) => {
        if (state.openBodies) throw new Error("it() cannot be called from inside a test body; use t.test() instead")
        const {name, options, fn} = normalize<TestFn>(args)
        state.current.declare("test", nameOf(name, fn), options, fn)
    }

    const testSkip: declared.TAL.TestBase = (...args: Args<TestFn>) => {
        const {name, options, fn} = normalize<TestFn>(args)
        return testBase(name, {...options, skip: true}, fn)
    }

    const test: declared.TAL.TestAPI = Object.assign(testBase, {skip: testSkip})

    // A hook belongs to the suite that declares it. before runs once when
    // that suite starts, after once everything below it has finished,
    // grandchildren included.
    const before: typeof declared.before = (fn) => {
        if (state.openBodies) throw new Error("before() cannot be called from inside a test body")
        state.current.before.push(fn)
    }

    const after: typeof declared.after = (fn) => {
        if (state.openBodies) throw new Error("after() cannot be called from inside a test body")
        state.current.after.push(fn)
    }

    return {suite, test, before, after}
}
