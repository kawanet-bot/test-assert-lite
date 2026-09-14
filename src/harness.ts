import type * as declared from "test-assert-lite"
import {createAssert} from "./assert.ts"
import {reporter} from "./reporter.ts"
import {createRegistrar} from "./runner/suite.ts"
import {createScheduler} from "./session/scheduler.ts"
import {createSessions} from "./session/session.ts"
import {createHarnessState} from "./session/state.ts"

// Binds everything the package exposes to one tree.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const sessions = createSessions(state)
    const assert = createAssert()
    const {schedule, end} = createScheduler(state, sessions, assert.methods)
    const {suite, test, before, after} = createRegistrar(state, schedule)

    return {
        after,
        assert: assert.assert,
        before,
        describe: suite,
        end,
        it: test,
        reporter,
        session: sessions.session,
        strict: assert.strict,
        suite,
        test,
    }
}
