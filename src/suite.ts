import type * as declared from "test-assert-lite"

type TestOptions = declared.TAL.TestOptions
type TestFn = declared.TAL.TestFn
type SuiteFn = declared.TAL.SuiteFn
type HookFn = declared.TAL.HookFn

export interface TestNode {
    kind: "test"
    name: string
    options: TestOptions
    fn: TestFn | undefined
}

// Each suite holds before / children / after. children is a single queue
// mixing describe and it in declaration order, which is what makes the
// execution order match node:test.
export interface SuiteNode {
    kind: "suite"
    name: string
    options: TestOptions
    fn: SuiteFn | undefined
    before: HookFn[]
    after: HookFn[]
    children: Node[]
    announced: boolean
    nesting: number
}

type Node = TestNode | SuiteNode

// The registration state of one harness. Wrapping it in a factory lets the
// self-tests build an isolated tree without touching the default harness.
export interface HarnessState {
    rootSuite: SuiteNode
    currentSuite: SuiteNode
    inTestBody: boolean
}

const makeSuite = (name: string, nesting: number): SuiteNode => ({
    kind: "suite", name, options: {}, fn: undefined,
    before: [], after: [], children: [], announced: false, nesting,
})

export const createHarnessState = (): HarnessState => {
    const rootSuite = makeSuite("", -1)
    return {rootSuite, currentSuite: rootSuite, inTestBody: false}
}

export const resetHarnessState = (state: HarnessState): void => {
    state.rootSuite = makeSuite("", -1)
    state.currentSuite = state.rootSuite
    state.inTestBody = false
}

// Falls back to the function name, then to <anonymous>, as node:test does.
export const nameOf = (name: string | undefined, fn: Function | undefined): string =>
    name || fn?.name || "<anonymous>"

export type Args<F> = [name?: string | TestOptions | F, options?: TestOptions | F, fn?: F]

export const normalize = <F>(args: Args<F>): {name: string | undefined, options: TestOptions, fn: F | undefined} => {
    const [a, b, c] = args
    if ("string" === typeof a) {
        if ("function" === typeof b) return {name: a, options: {}, fn: b as F}
        return {name: a, options: (b as TestOptions) ?? {}, fn: c}
    }
    if ("function" === typeof a) return {name: undefined, options: {}, fn: a as F}
    return {name: undefined, options: (a as TestOptions) ?? {}, fn: (b as F) ?? c}
}

interface Registrar {
    suite: declared.TAL.SuiteAPI
    test: declared.TAL.TestAPI
    before: typeof declared.before
    after: typeof declared.after
}

// Binds the four registration functions to one state. Each of them only
// reads currentSuite, so the four of them close over exactly what they need.
export const createRegistrar = (state: HarnessState): Registrar => {
    const suiteBase: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        if (state.inTestBody) throw new Error("describe() cannot be called from inside a test body")
        const {name, options, fn} = normalize<SuiteFn>(args)
        const node = makeSuite(nameOf(name, fn), state.currentSuite.nesting + 1)
        node.options = options
        node.fn = fn
        state.currentSuite.children.push(node)
    }

    const suiteSkip: declared.TAL.SuiteBase = (...args: Args<SuiteFn>) => {
        const {name, options, fn} = normalize<SuiteFn>(args)
        return suiteBase(name, {...options, skip: true}, fn)
    }

    const suite: declared.TAL.SuiteAPI = Object.assign(suiteBase, {skip: suiteSkip})

    const testBase: declared.TAL.TestBase = (...args: Args<TestFn>) => {
        if (state.inTestBody) throw new Error("it() cannot be called from inside a test body; use t.test() instead")
        const {name, options, fn} = normalize<TestFn>(args)
        state.currentSuite.children.push({kind: "test", name: nameOf(name, fn), options, fn})
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
        if (state.inTestBody) throw new Error("before() cannot be called from inside a test body")
        state.currentSuite.before.push(fn)
    }

    const after: typeof declared.after = (fn) => {
        if (state.inTestBody) throw new Error("after() cannot be called from inside a test body")
        state.currentSuite.after.push(fn)
    }

    return {suite, test, before, after}
}
