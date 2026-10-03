// Declarations for session.js, each typed off the harness so it cannot drift.
import type {TAL} from "test-assert-lite"

type SessionAPI = TAL.SessionAPI

export declare const load: SessionAPI["load"]
export declare const run: SessionAPI["run"]
export declare const session: SessionAPI["session"]
export declare const connect: SessionAPI["connect"]
