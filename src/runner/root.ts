import type {HarnessState} from "../session/state.ts"
import type {Run} from "./tester.ts"
import {Test} from "./tester.ts"

// What the top level declares into. The root has no body and no result of
// its own, and runs on the scheduler's clock rather than in a parent's
// turn: each walk takes the hooks and the children declared since the
// last one, and end() asks for the teardown once nothing is left.
export class Root extends Test {
    private beforeNext = 0
    private afterNext = 0
    private setupError: Error | undefined

    constructor(harness: HarnessState) {
        super("suite", "", {}, undefined, null, harness)
    }

    // The root cannot carry a result, so node:test charges its hook error
    // to each direct child instead.
    protected override get verdictForChildren() {
        if (!this.settled || this.error == null) return undefined
        return {error: this.error, outcome: "failed" as const}
    }

    protected override async report(): Promise<void> {
        return
    }

    // Takes what was declared since the last walk, hooks included, as
    // node:test does each time its queue drains.
    async walk(run: Run): Promise<void> {
        if (!this.started) {
            this.run = run
            this.started = true
            this.startedAt = performance.now()
        }
        await this.runSetup()
        await this.runChildren()
        await this.runTeardown()
    }

    get hasPendingChildren(): boolean {
        return this.next < this.children.length
    }

    // Nothing below a broken setup may run: the children so far are
    // closed here, the later ones as they are declared.
    private async runSetup(): Promise<void> {
        if (this.setupError != null) return
        const hooks = this.before.slice(this.beforeNext)
        this.beforeNext = this.before.length
        this.setupError = await this.runHooks(hooks)
        if (this.setupError != null) this.settle(this.setupError)
    }

    // A failing after hook has no child to be charged to, so it is
    // reported on its own and left out of the counts.
    private async runTeardown(): Promise<void> {
        const hooks = this.after.slice(this.afterNext)
        this.afterNext = this.after.length
        const error = await this.runHooks(hooks)
        if (error == null) return
        this.run.success = false
        await this.run.emit("test:fail", {
            name: "root after hook", nesting: 0, testNumber: 0,
            details: {duration_ms: 0, type: "suite", error},
        })
    }

    // Late subtests join the end of the root's line and run after its
    // teardown, so a timed out body cannot hold that up. node:test lets an
    // empty run pass; a failed setup should never be green, so a before
    // hook that failed with no child to charge is reported here.
    async end(): Promise<void> {
        while (await this.drain()) await this.runChildren()
        if (this.setupError != null) {
            this.run.success = false
            if (!this.children.length) {
                await this.run.emit("test:fail", {
                    name: "root before hook", nesting: 0, testNumber: 0,
                    details: {duration_ms: 0, type: "suite", error: this.setupError},
                })
            }
        }
        this.settle()
        await this.awaitReporting()
    }

    // Once the after hooks are done, what is declared by then is all that
    // is left: a body that outlived its timeout is not waited for. One
    // turn is given, since a body that was awaiting the last late subtest
    // resumes only then and may declare more.
    private async drain(): Promise<boolean> {
        await new Promise(resolve => setTimeout(resolve, 0))
        if (this.hasPendingChildren) return true
        this.run.closed = true
        return false
    }
}
