// Declarations for test.js, each typed off the harness so it cannot drift.
import type {TAL} from "test-assert-lite"

type Harness = TAL.TestHarness

export declare const after: Harness["after"]
export declare const before: Harness["before"]
export declare const describe: Harness["describe"]
export declare const it: Harness["it"]
export declare const suite: Harness["suite"]
export declare const test: Harness["test"]
export default test
