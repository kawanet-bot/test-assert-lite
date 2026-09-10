/**
 * https://github.com/kawanet/test-assert-lite
 *
 * A subset of `node:test` and `node:assert` that runs in browsers.
 */

export {} // external module indicator

export declare namespace TAL {
    // --- test ---

    type TestFn = (t: TestContext) => void | Promise<void>

    type SuiteFn = (s: SuiteContext) => void | Promise<void>

    type HookFn = () => void | Promise<void>

    interface TestOptions {
        skip?: boolean | string
        // A todo runs and is reported, but is counted as todo whatever the
        // verdict, and its failure does not fail the run. A skip outranks it.
        todo?: boolean | string
        timeout?: number
    }

    interface SuiteContext {
        readonly name: string
    }

    interface TestContext {
        readonly name: string
        readonly assert: AssertMethods
        skip(message?: string): void
        todo(message?: string): void
        diagnostic(message: string): void

        // Subtests run immediately, ahead of the parent's remaining body.
        // Unlike the top-level `it`, the returned promise is meaningful.
        // One declared after the parent was reported (after its timeout,
        // say) runs at the top level and fails as parentAlreadyFinished.
        test(name?: string, options?: TestOptions, fn?: TestFn): Promise<void>
        test(name?: string, fn?: TestFn): Promise<void>
        test(options?: TestOptions, fn?: TestFn): Promise<void>
        test(fn?: TestFn): Promise<void>
    }

    // `describe` / `suite`. The static variants take the same arguments.
    interface SuiteBase {
        (name?: string, options?: TestOptions, fn?: SuiteFn): void
        (name?: string, fn?: SuiteFn): void
        (options?: TestOptions, fn?: SuiteFn): void
        (fn?: SuiteFn): void
    }

    interface SuiteAPI extends SuiteBase {
        skip: SuiteBase
        todo: SuiteBase
    }

    // `it` / `test`. The static variants take the same arguments.
    interface TestBase {
        (name?: string, options?: TestOptions, fn?: TestFn): void
        (name?: string, fn?: TestFn): void
        (options?: TestOptions, fn?: TestFn): void
        (fn?: TestFn): void
    }

    interface TestAPI extends TestBase {
        skip: TestBase
        todo: TestBase
    }

    // --- assert ---

    // What `doesNotThrow` filters by: a RegExp tested against String(error),
    // a class the error must be an instance of (Error or not, as node:assert
    // takes any), or a validation function that returns true on a match.
    type ErrorFilter = RegExp | (new (...args: never[]) => object) | ((thrown: unknown) => boolean)

    // What `throws` matches against: any filter above, or an object whose
    // properties the error must carry, a RegExp value being tested against
    // the property's string form. An Error instance counts as such an
    // object, name and message included. The same shapes node:assert takes.
    type AssertPredicate = ErrorFilter | object

    interface AssertBase {
        fail(message?: string | Error): never
        equal(actual: unknown, expected: unknown, message?: string | Error): void
        notEqual(actual: unknown, expected: unknown, message?: string | Error): void
        deepEqual(actual: unknown, expected: unknown, message?: string | Error): void
        notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void
        strictEqual(actual: unknown, expected: unknown, message?: string | Error): void
        notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void
        deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void
        notDeepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void
        // As in node:assert, a string in the second position is the message.
        throws(block: () => unknown, message?: string): void
        throws(block: () => unknown, expected: AssertPredicate | undefined, message?: string | Error): void
        doesNotThrow(block: () => unknown, message?: string): void
        doesNotThrow(block: () => unknown, expected: ErrorFilter | undefined, message?: string | Error): void
        // The same pair for a promise, or an async function returning one:
        // judged once it settles, and a misuse rejects rather than throws.
        // Declared as node:assert declares them.
        rejects(block: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void>
        rejects(block: Promise<unknown> | (() => Promise<unknown>), expected: AssertPredicate | undefined, message?: string | Error): Promise<void>
        doesNotReject(block: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void>
        doesNotReject(block: Promise<unknown> | (() => Promise<unknown>), expected: ErrorFilter | undefined, message?: string | Error): Promise<void>
        match(value: string, regExp: RegExp, message?: string | Error): void
        doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void
    }

    // Reachable as `t.assert`. `ok` and `ifError` are plain checks here rather
    // than assertion signatures: narrowing through a callback parameter trips
    // TS2775, which `node:test` itself hits on `t.assert.ok()`.
    interface AssertMethods extends AssertBase {
        ok(value: unknown, message?: string | Error): void
        ifError(value: unknown): void
    }

    // `assert` compares loosely in equal / notEqual / deepEqual /
    // notDeepEqual, `strict` (reachable as `assert.strict` too) strictly;
    // the *StrictEqual names are strict on both, as in node:assert.
    interface Assert extends AssertBase {
        (value: unknown, message?: string | Error): asserts value
        ok(value: unknown, message?: string | Error): asserts value
        ifError(value: unknown): asserts value is null | undefined
        strict: Assert
    }

    // --- failures ---

    type FailureType =
        | "testCodeFailure"
        | "hookFailed"
        | "cancelledByParent"
        | "testTimeoutFailure"
        | "subtestsFailed"
        | "parentAlreadyFinished"

    // A failure the runner produced itself, or a thrown value that was not
    // an Error. An Error thrown by test code is reported as is. `code`
    // matches node:test's wrapper so a check written for it holds here.
    interface TesterError extends Error {
        readonly name: "TesterError"
        readonly code: "ERR_TEST_FAILURE"
        readonly failureType: FailureType
        readonly cause: unknown
    }

    // --- events ---

    interface TestStart {
        name: string
        nesting: number
    }

    // A suite is reported after its children, with `type: "suite"`.
    // `testNumber` counts within the parent, suites and tests together.
    // A result carries `skip` or `todo`, never both: a skip outranks a todo.
    interface TestPass {
        name: string
        nesting: number
        testNumber: number
        skip?: string | boolean
        todo?: string | boolean
        details: {
            duration_ms: number
            type: "suite" | "test"
        }
    }

    // `error` is what the test threw, or a TesterError. A suite fails
    // with its hook's or body's error, or with `subtestsFailed` when only
    // a child did. A test never run because its parent failed is reported
    // as `cancelledByParent` and counted under `cancelled`.
    interface TestFail {
        name: string
        nesting: number
        testNumber: number
        skip?: string | boolean
        todo?: string | boolean
        details: {
            duration_ms: number
            type: "suite" | "test"
            error: Error
        }
    }

    interface TestDiagnostic {
        message: string
        nesting: number
        level: "info" | "warn" | "error"
    }

    interface TestSummary {
        counts: {
            cancelled: number
            failed: number
            passed: number
            skipped: number
            suites: number
            tests: number
            todo: number
        }
        duration_ms: number
        success: boolean
    }

    type TestEvent =
        | {type: "test:start"; data: TestStart}
        | {type: "test:pass"; data: TestPass}
        | {type: "test:fail"; data: TestFail}
        | {type: "test:diagnostic"; data: TestDiagnostic}
        | {type: "test:summary"; data: TestSummary}

    // --- reporter ---

    // Compatible with a `node:test` reporter, so the same function can be
    // passed to `--test-reporter`. Each chunk yielded is a complete line.
    type FormatFn = (source: AsyncIterable<TestEvent>) => AsyncIterable<string>

    type OutputFn = (text: string) => void | Promise<void>

    interface SpecOptions {
        // Defaults on for a Node TTY unless NO_COLOR or NODE_DISABLE_COLORS is set; off otherwise.
        colors?: boolean
    }

    interface Reporter {
        format(fn: FormatFn): void
        output(fn: OutputFn): void
        spec(options?: SpecOptions): FormatFn
        tap(): FormatFn
        html(): FormatFn
        /**
         * The page's side of the channel to the CLI at `base`, the run's URL
         * ending in "/". Sending never rejects: the page can do nothing
         * about a CLI that went away.
         */
        client(base: string | URL): Client
    }

    interface Client {
        /** Tells the CLI the page is up; it waits for this with a timeout. */
        begin(): Promise<void>
        /** Text for the CLI's stdout, buffered. */
        stdout(text: string): void
        /** Text for the CLI's stderr, buffered. */
        stderr(text: string): void
        /** The verdict, sent once the buffers have drained; true alone passes. */
        end(success: boolean): Promise<void>
    }

    // --- harness ---

    // One isolated set of everything the package exports. The named exports
    // below are the default one; `createTAL()` hands out another.
    interface TestHarness {
        after: typeof after
        assert: Assert
        before: typeof before
        describe: SuiteAPI
        it: TestAPI
        reporter: Reporter
        run: typeof run
        strict: Assert
        suite: SuiteAPI
        test: TestAPI
    }
}

export declare const suite: TAL.SuiteAPI

export declare const describe: TAL.SuiteAPI

export declare const test: TAL.TestAPI

export declare const it: TAL.TestAPI

export declare function before(fn: TAL.HookFn): void

export declare function after(fn: TAL.HookFn): void

export declare const assert: TAL.Assert

export declare const strict: TAL.Assert

export declare const reporter: TAL.Reporter

export declare function createTAL(): TAL.TestHarness

/**
 * Runs every registered test, then resets the registry. Reporter format and
 * output settings remain installed for later runs.
 * Resolves once all tests and hooks have finished, the formatter has ended
 * and any asynchronous output has completed. Reporter failures and a
 * formatter that ends before its input reject the returned promise.
 * A concurrent call on the same harness also rejects.
 */
export declare function run(): Promise<TAL.TestSummary>
