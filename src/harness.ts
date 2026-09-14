import type * as declared from "test-assert-lite"
import {createAssert} from "./assert.ts"
import {reporter} from "./reporter.ts"
import {createHarnessState, createRegistrar, createScheduler} from "./runner.ts"
import {createSessions} from "./session.ts"

// Binds everything the package exposes to one tree. The pieces meet here
// because suite.ts reaching for runner.ts would close a cycle.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const sessions = createSessions()
    const assert = createAssert()
    const {schedule, run} = createScheduler(state, sessions, assert.methods)
    const {suite, test, before, after} = createRegistrar(state, schedule)

    return {
        after,
        assert: assert.assert,
        before,
        describe: suite,
        end: sessions.end,
        it: test,
        reporter,
        run,
        session: sessions.session,
        strict: assert.strict,
        suite,
        test,
    }
}
