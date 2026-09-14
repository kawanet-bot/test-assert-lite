import type * as declared from "test-assert-lite"
import {TesterError, testRunnerError} from "../utils/tester-error.ts"
import type {Job, Outcome} from "./job.ts"
import type {Kind} from "./tester.ts"
import {Tester} from "./tester.ts"

type TestOptions = declared.TAL.TestOptions
type SuiteFn = declared.TAL.SuiteFn
type HookFn = declared.TAL.HookFn

// One suite: its body declares the children, its hooks wrap them, and it
// carries their verdict. A suite is reported like a test, which is why it
// is one here, as it is in node:test.
export class Suite extends Tester {
    override readonly kind: Kind = "suite"

    readonly before: HookFn[] = []
    readonly after: HookFn[] = []

    // The next child to start. The root keeps taking declarations while
    // it runs, so its walk resumes from here.
    protected next = 0

    declareSuite(name: string, options: TestOptions, fn: SuiteFn | undefined): Suite {
        return this.adopt(new Suite(name, options, fn, this, this.harness))
    }

    protected override async runBody(): Promise<Job[]> {
        if (this.skip != null) {
            this.settle()
            return []
        }
        // The hooks run whatever the body did, as in node:test; the body's
        // error is the one charged. Nothing below a broken setup may run:
        // the children are closed here, and start only to be reported.
        const bodyError = await this.runSuiteBody()
        const beforeError = await this.runHooks(this.before)
        let error = bodyError ?? beforeError
        if (error != null) this.settle(error)
        const failedChildren = await this.runChildren()

        // after runs whatever happened above, as it does in node:test.
        const afterError = await this.runHooks(this.after)
        error ??= afterError
        if (error == null && failedChildren) {
            error = new TesterError(`${failedChildren} subtest${failedChildren === 1 ? "" : "s"} failed`, "subtestsFailed")
        }
        this.settle(error)
        return []
    }

    // A suite the parent gave up on before it started still runs its body,
    // since that is what declares the children node:test would already know
    // about; each of them is closed the moment it is declared.
    protected override async startClosed(): Promise<Outcome> {
        if (this.skip == null) {
            // The body still takes time, so the clock runs for it.
            this.started = true
            this.startedAt = performance.now()
            const bodyError = await this.runSuiteBody()
            if (bodyError != null) this.error = bodyError
            for (const child of this.children) await child.start(this.run)
            this.endedAt = performance.now()
        }
        return super.startClosed()
    }

    // Starts the children not started yet, in order, and counts the ones
    // that failed. A child declared while an earlier one runs is taken.
    protected async runChildren(): Promise<number> {
        let failed = 0
        for (; this.next < this.children.length; this.next++) {
            const outcome = await this.children[this.next]!.start(this.run)
            if (outcome === "failed" || outcome === "cancelled") failed++
        }
        return failed
    }

    // The body runs for the first time here, so both the registration of
    // children and an async body settle while the walk is still inside
    // this suite. Its own error, if any, is the suite's to carry.
    private async runSuiteBody(): Promise<Error | undefined> {
        const {harness} = this
        const previous = harness.current
        harness.current = this
        harness.openSuites++
        try {
            const body = (this.fn as SuiteFn | undefined)?.({name: this.name})
            if (body != null) await body
            return undefined
        } catch (e) {
            return testRunnerError(e, "testCodeFailure")
        } finally {
            harness.openSuites--
            harness.current = previous
        }
    }

    // Runs the hooks in order and stops at the first failure, which is
    // returned as the error to charge to the suite.
    protected async runHooks(list: HookFn[]): Promise<Error | undefined> {
        for (const fn of list) {
            try {
                await fn()
            } catch (e) {
                return testRunnerError(e, "hookFailed")
            }
        }
        return undefined
    }

    protected override count(): void {
        this.run.counters.suites++
    }
}
