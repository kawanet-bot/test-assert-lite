// Types for test-assert-lite/test. Each export takes its type from
// TAL.RegistrarAPI, so the two cannot drift apart.
import type {TAL} from "test-assert-lite"

type RegistrarAPI = TAL.RegistrarAPI

export declare const after: RegistrarAPI["after"]
export declare const before: RegistrarAPI["before"]
export declare const describe: RegistrarAPI["describe"]
export declare const it: RegistrarAPI["it"]
export declare const suite: RegistrarAPI["suite"]
export declare const test: RegistrarAPI["test"]
export default test
