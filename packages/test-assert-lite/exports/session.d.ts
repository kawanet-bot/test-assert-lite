// Types for test-assert-lite/session. Each export takes its type from
// TAL.SessionAPI, so the two cannot drift apart.
import type {TAL} from "test-assert-lite"

type SessionAPI = TAL.SessionAPI

export declare const load: SessionAPI["load"]
export declare const run: SessionAPI["run"]
export declare const session: SessionAPI["session"]
