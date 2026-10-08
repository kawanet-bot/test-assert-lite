import type * as declared from "test-assert-lite"
import type {TAL} from "test-assert-lite"
import {createAssert} from "./assert/assert.ts"
import {proc} from "./process/proc.ts"
import {html} from "./reporter/html.ts"
import {spec} from "./reporter/spec.ts"
import {tap} from "./reporter/tap.ts"
import {createSessions} from "./session/session.ts"
import {createHarnessState} from "./session/state.ts"
import {createRegistrar} from "./suite/registrar.ts"

// Binds everything the package exposes to one tree.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const {assert, tca} = createAssert()
    const {session, schedule, run, load} = createSessions(state, tca)
    const registrar = createRegistrar(state, schedule)
    const reporter: TAL.Reporter = {spec, tap, html}

    return {
        assert,
        proc,
        reporter,
        sess: {load, run, session},
        test: registrar,
    }
}
