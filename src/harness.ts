import type * as declared from "test-assert-lite"
import type {TAL} from "test-assert-lite"
import {createAssert} from "./assert/assert.ts"
import {html} from "./reporter/html.ts"
import {spec} from "./reporter/spec.ts"
import {tap} from "./reporter/tap.ts"
import {channelOverFetch} from "./session/fetch-channel.ts"
import {createSessions} from "./session/session.ts"
import {createHarnessState} from "./session/state.ts"
import {createRegistrar} from "./suite/registrar.ts"
import {createConnectWriter, pureWriter} from "./utils/buf-writer.ts"

// Binds everything the package exposes to one tree.
export const createTAL: typeof declared.createTAL = () => {
    const state = createHarnessState()
    const {assert, tca} = createAssert()
    // The host's streams as a script sees them: one pair for the harness's
    // life, led to each session's channel in turn.
    const stdout = createConnectWriter()
    const stderr = createConnectWriter()
    const {session, schedule, run} = createSessions(state, tca, {stdout, stderr})
    const registrar = createRegistrar(state, schedule)
    const reporter: TAL.Reporter = {spec, tap, html}

    // A suite that does not load is one failed test named after the file,
    // as node --test files it; the run goes on to the next.
    const load: TAL.SessionAPI["load"] = async file => {
        try {
            await import(file)
        } catch (error) {
            registrar.test(file.replace(/^[^?]*\//, ""), () => {
                throw error
            })
        }
    }

    const connect: TAL.SessionAPI["connect"] = (options) => channelOverFetch(options?.fetch ?? fetch)

    return {
        assert,
        proc: {stdout: pureWriter(stdout), stderr: pureWriter(stderr)},
        reporter,
        session: {connect, load, run, session},
        test: registrar,
    }
}
