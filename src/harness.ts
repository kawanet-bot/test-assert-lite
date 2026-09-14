import type * as declared from "test-assert-lite"
import {createAssert} from "./assert/assert.ts"
import {html} from "./reporter/html.ts"
import {spec} from "./reporter/spec.ts"
import {tap} from "./reporter/tap.ts"
import {createScheduler} from "./session/scheduler.ts"
import {createSessions} from "./session/session.ts"
import {createHarnessState} from "./session/state.ts"
import {createRegistrar} from "./suite/registrar.ts"

// Binds everything the package exposes to one tree.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const sessions = createSessions(state)
    const {assert, methods, strict} = createAssert()
    const {schedule, end} = createScheduler(state, sessions, methods)
    const {suite, test, before, after} = createRegistrar(state, schedule)
    const reporter: declared.TAL.Reporter = {spec, tap, html}

    return {
        after,
        assert,
        before,
        describe: suite,
        end,
        it: test,
        reporter,
        session: sessions.session,
        strict,
        suite,
        test,
    }
}
