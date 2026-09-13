import type * as declared from "test-assert-lite"
import {createAssert} from "./assert.ts"
import {createReporter} from "./reporter.ts"
import {createHarnessState, createRegistrar, createScheduler} from "./runner.ts"

// Binds everything the package exposes to one tree. The pieces meet here
// because suite.ts reaching for runner.ts would close a cycle.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const control = createReporter()
    const assert = createAssert()
    const {schedule, run} = createScheduler(state, control, assert.methods)
    const {suite, test, before, after} = createRegistrar(state, schedule)

    return {
        after,
        assert: assert.assert,
        before,
        describe: suite,
        it: test,
        reporter: control.reporter,
        run,
        strict: assert.strict,
        suite,
        test,
    }
}
