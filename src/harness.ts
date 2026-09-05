import type * as declared from "test-assert-lite"
import {createAssert} from "./assert.ts"
import {createReporter} from "./reporter.ts"
import {createRun} from "./runner.ts"
import {createHarnessState, createRegistrar} from "./suite.ts"

// Binds everything the package exposes to one tree. The pieces meet here
// because suite.ts reaching for runner.ts would close a cycle.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const {suite, test, before, after} = createRegistrar(state)
    const control = createReporter()
    const assert = createAssert()

    return {
        after,
        before,
        describe: suite,
        it: test,
        reporter: control.reporter,
        run: createRun(state, control, assert.methods),
        strict: assert.strict,
        suite,
        test,
    }
}
