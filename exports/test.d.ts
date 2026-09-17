// Declarations for test.js, each typed off the harness so it cannot drift.
import type {TAL} from "test-assert-lite"

type TestHarness = TAL.TestHarness

export declare const after: TestHarness["after"]
export declare const before: TestHarness["before"]
export declare const describe: TestHarness["describe"]
export declare const it: TestHarness["it"]
export declare const suite: TestHarness["suite"]
export declare const test: TestHarness["test"]
export default test
