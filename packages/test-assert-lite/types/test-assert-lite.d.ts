/**
 * https://github.com/kawanet/test-assert-lite
 *
 * A subset of `node:test` and `node:assert` that runs in browsers.
 */

export declare namespace TAL {
    // --- test ---

    type TestFn = (t: TestContext) => void | Promise<void>

    type SuiteFn = (s: SuiteContext) => void | Promise<void>

    type HookFn = () => void | Promise<void>

    /** The functions of `test-assert-lite/test`, which declare suites, tests and hooks. */
    interface RegistrarAPI {
        /** Runs once after everything in the suite that declares it has finished. */
        after(fn: HookFn): void

        /** Runs once when the suite that declares it starts. */
        before(fn: HookFn): void

        describe: SuiteAPI
        it: TestAPI
        suite: SuiteAPI
        test: TestAPI
    }

    interface TestOptions {
        /** Skips the test, and a string says why. */
        skip?: boolean | string
        /**
         * A todo test runs and is reported. It counts as todo whether it passes
         * or fails, so it never fails the run. A skip outranks it.
         */
        todo?: boolean | string
        /** Milliseconds before the test fails as timed out. */
        timeout?: number
    }

    interface SuiteContext {
        readonly name: string
    }

    interface TestContext {
        readonly name: string
        readonly assert: TestContextAssert
        skip(message?: string): void
        todo(message?: string): void
        diagnostic(message: string): void

        /**
         * Subtests run one at a time, in the order declared. Unlike the top-level
         * `test`, this returns a promise to await. A subtest declared after its parent
         * was reported, such as after a timeout, runs at the top level and fails as parentAlreadyFinished.
         */
        test(name?: string, options?: TestOptions, fn?: TestFn): Promise<void>
        test(name?: string, fn?: TestFn): Promise<void>
        test(options?: TestOptions, fn?: TestFn): Promise<void>
        test(fn?: TestFn): Promise<void>
    }

    /** `describe` and `suite`. Their `skip` and `todo` take the same arguments. */
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

    /** `it` and `test`. Their `skip` and `todo` take the same arguments. */
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

    /**
     * A filter that `doesNotThrow` and `doesNotReject` take. A RegExp is tested
     * against String(error). A class, Error or not, matches its instances, as in
     * node:assert. A validation function returns true on a match.
     */
    type ErrorFilter = RegExp | (new (...args: never[]) => object) | ((thrown: unknown) => boolean)

    /**
     * An expectation that `throws` and `rejects` take. An ErrorFilter, or an object
     * whose properties the error must have, where a RegExp value is tested against
     * the property's string form. An Error instance works as such an object. node:assert takes the same.
     */
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
        // The same pair for a promise, or for a function that returns one.
        // The check runs once the promise settles. A misuse rejects rather than throws.
        rejects(block: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void>
        rejects(block: Promise<unknown> | (() => Promise<unknown>), expected: AssertPredicate | undefined, message?: string | Error): Promise<void>
        doesNotReject(block: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void>
        doesNotReject(block: Promise<unknown> | (() => Promise<unknown>), expected: ErrorFilter | undefined, message?: string | Error): Promise<void>
        match(value: string, regExp: RegExp, message?: string | Error): void
        doesNotMatch(value: string, regExp: RegExp, message?: string | Error): void
    }

    /**
     * The assertions on `t.assert`. Here `ok` and `ifError` do not narrow types.
     * An assertion signature on a callback parameter trips TS2775, as `node:test`
     * does on `t.assert.ok()`.
     */
    interface TestContextAssert extends AssertBase {
        ok(value: unknown, message?: string | Error): void
        ifError(value: unknown): void
    }

    /**
     * In `assert` the names such as `equal` and `deepEqual` compare loosely.
     * In `strict`, also reachable as `assert.strict`, they compare strictly.
     * The *StrictEqual names are strict in both, as in node:assert.
     */
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

    /**
     * A failure the runner produced itself, or a thrown value that was not
     * an Error. An Error thrown by test code is reported as is. `code`
     * matches node:test's wrapper so a check written for it holds here.
     */
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

    /**
     * A suite is reported after its children, with `type: "suite"`.
     * `testNumber` counts within the parent, suites and tests together.
     * A result carries `skip` or `todo`, never both. A skip outranks a todo.
     */
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

    /**
     * `error` is what the test threw, or a TesterError. A suite fails
     * with its hook's or body's error, or with `subtestsFailed` when only
     * a child did. A test never run because its parent failed is reported
     * as `cancelledByParent` and counted under `cancelled`.
     */
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

    /** A test file's own output, as node --test relays it. This package's runner emits neither. */
    interface TestStdout {
        file: string
        message: string
    }

    interface TestStderr {
        file: string
        message: string
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
        | {type: "test:start", data: TestStart}
        | {type: "test:pass", data: TestPass}
        | {type: "test:fail", data: TestFail}
        | {type: "test:diagnostic", data: TestDiagnostic}
        | {type: "test:stdout", data: TestStdout}
        | {type: "test:stderr", data: TestStderr}
        | {type: "test:summary", data: TestSummary}

    // --- reporter ---

    type ReporterFn = (source: AsyncIterable<TestEvent>) => AsyncIterable<string>

    type OutputFn = (text: string) => void | Promise<void>

    interface SpecOptions {
        /** Color in the output. A Node TTY gets it by default, as in node. */
        colors?: boolean
        /** A quiet level, 0 by default. 1 or more leaves out the result lines and keeps the list of failures. */
        quiet?: number
    }

    /** The reporters the package ships. */
    interface Reporter {
        spec(options?: SpecOptions): ReporterFn
        tap(): ReporterFn
        html(): ReporterFn
    }

    // --- session ---

    /** A window, or a stand-in for one. The session listens to its `error` and `unhandledrejection` events. */
    interface EventTargetLike {
        addEventListener(type: string, listener: (event: unknown) => void, capture?: boolean): void
        removeEventListener(type: string, listener: (event: unknown) => void, capture?: boolean): void
    }

    /** Node's process, or a stand-in for it. The session listens to its `uncaughtException` and `unhandledRejection` events. */
    interface EventEmitterLike {
        on(event: string, listener: (...args: unknown[]) => void): unknown
        off(event: string, listener: (...args: unknown[]) => void): unknown
    }

    /** The console methods that a session takes over. */
    interface ConsoleLike {
        debug(...args: unknown[]): void
        log(...args: unknown[]): void
        info(...args: unknown[]): void
        warn(...args: unknown[]): void
        error(...args: unknown[]): void
    }

    interface SessionOptions {
        /** Formats the run's events. A string names a built-in reporter, such as `"tap"`, or a module to import. `spec` by default. */
        reporter?: ReporterFn | string
        /** The destination of the formatted text, the run's stdout unless given. */
        output?: OutputFn
        /** The channel to the host. By default, the realm's channel that connect() made. */
        channel?: Channel
        /**
         * A window or a process to watch until run() ends. Each uncaught exception
         * or unhandled rejection on it counts as one failed test.
         */
        uncaught?: EventTargetLike | EventEmitterLike
        /**
         * A console the session takes over until run(). debug, log and info
         * go to `stdout`, warn and error to `stderr`, each call one line.
         */
        console?: ConsoleLike
        /**
         * A quiet level, 0 by default. 1 or more leaves out the summary
         * lines, and with the default reporter, the result lines too. -1 reports
         * a run with no tests, as node --test does. The summary event is always sent.
         */
        quiet?: number
        /** Milliseconds of silence before the run writes an alive line to `stderr`. 10 seconds by default. 0 turns it off. */
        heartbeat?: number
    }

    /** The result run() resolves with. It says whether every test passed. */
    interface SessionResult {
        success: boolean
    }

    /** One of the run's streams. */
    interface Writer {
        write(chunk: string): void
    }

    /** The functions of `test-assert-lite/session`, which drive a session. */
    interface SessionAPI {
        /** Opens a session for the tests declared after it. It must come before the first declaration. */
        session(options?: SessionOptions): void

        /**
         * Imports a test file by URL or absolute path, so its tests are declared.
         * A file that fails to import counts as one failed test. Call it before run().
         */
        load(file: string): Promise<void>

        /** Runs every declared test, reports the result, and closes the session. */
        run(): Promise<SessionResult>
    }

    // --- process ---

    /**
     * The host as a script sees it, through `test-assert-lite/process`.
     * It offers a few members of node:process. There is one per realm,
     * shared by every harness.
     */
    interface ProcessAPI {
        /** The arguments the host gave, as node's process.argv has them. Empty until the host fills it. */
        argv: string[]

        /** The host's stdout, through the realm's channel. */
        stdout: Writer
        /** The host's stderr, through the realm's channel. */
        stderr: Writer

        /** Connects the realm to its host for the sessions to come, over the fetch given if any. It also sets `argv`. */
        connect(options?: {fetch?: typeof fetch, argv?: string[]}): Channel
    }

    // --- session channel ---

    /**
     * The session's link to its host, shaped like a child process.
     * It has the host's streams and a way to send messages.
     */
    interface Channel {
        /** The host's stdout, as the session writes it. */
        stdout: Writer
        /** The host's stderr, as the session writes it. */
        stderr: Writer

        /** Sends a message to the host. */
        send(message: SessionEvent, callback?: (error: Error | null) => void): void

        /** Called once the session has sent its result. */
        disconnect(): void
    }

    /**
     * A message that send() carries. Each one names its session, so a host
     * with several sessions on one channel can tell them apart.
     */
    type SessionEvent =
        | {type: "session:begin", session: string}
        | {type: "session:end", session: string, data: SessionResult}

    // --- harness ---

    /**
     * One harness, with its own tests and session apart from any other.
     * `proc` is the exception. There is one per realm.
     */
    interface TestHarness {
        assert: Assert
        /** The realm's process, the same in every harness. */
        proc: ProcessAPI
        reporter: Reporter
        session: SessionAPI
        test: RegistrarAPI
    }
}

/** The harness that the subpaths share, such as `test-assert-lite/test` and `test-assert-lite/assert`. */
export declare const sharedTAL: TAL.TestHarness

/** Creates a local harness apart from `sharedTAL`. */
export declare function createTAL(): TAL.TestHarness
