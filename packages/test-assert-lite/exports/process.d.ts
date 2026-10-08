// Types for test-assert-lite/process. Each export takes its type from
// TAL.ProcessAPI, so the two cannot drift apart.
import type {TAL} from "test-assert-lite"

type ProcessAPI = TAL.ProcessAPI

export declare const argv: ProcessAPI["argv"]
export declare const stdout: ProcessAPI["stdout"]
export declare const stderr: ProcessAPI["stderr"]
export declare const connect: ProcessAPI["connect"]
declare const proc: ProcessAPI
export default proc
