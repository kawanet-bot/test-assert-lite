import type {TAL} from "test-assert-lite"
import type {TesterError} from "../utils/tester-error.ts"
import {cancelledByParent} from "../utils/tester-error.ts"

type Counters = TAL.TestSummary["counts"]

// How a test or suite ended, as its parent sees it. A parent whose child
// failed or was cancelled fails in turn, as it does in node:test.
export type Outcome = "passed" | "failed" | "cancelled" | "skipped"

// What a parent that gave up hands to a child: the error to report and
// how to count it.
export interface Verdict {
    error: Error
    outcome: Outcome
}

// What one run shares with every test in it.
export interface Run {
    counters: Counters
    success: boolean
    emit: (type: string, data: TAL.TestEvent["data"]) => Promise<void>
    // t.assert uses the harness's assert, so once it takes options, what a
    // body sees stays consistent within one run.
    assert: TAL.TestContextAssert
    // Set once the root has nothing left to run. A body that outlived its
    // verdict is not waited for; what it does after this is dropped.
    closed: boolean
}

// One unit of the tree, from its declaration to its report: the parent
// declares it, then starts it in turn; it settles once, on its own or on
// the verdict a parent that gave up handed down. What runs in between,
// and what is reported for it, are the subclass's to say.
export class Job {
    readonly name: string
    readonly parent: Job | null
    readonly nesting: number
    readonly testNumber: number
    readonly children: Job[] = []

    // The failure a late subtest carries from the start: node:test files it
    // as parentAlreadyFinished whatever its body does.
    protected late: TesterError | undefined
    // Resumes the body that declared this late subtest, once it is reported.
    protected onDone: (() => void) | undefined

    protected run!: Run
    private announced = false
    protected started = false
    protected startedAt = 0
    protected endedAt = 0
    // The verdict is out, from this job or from a parent that gave up on
    // it. Set before the first reporter await, so nothing the body does
    // while the verdict is being reported can reopen it.
    protected settled = false
    protected error: Error | undefined
    protected cancelled = false
    // The verdict a parent handed down, when it gave up on this job.
    private closedWith: Verdict | undefined
    // Resolves once this subtest has reported, for a parent that settles
    // while the subtest, already settled itself, is still reporting.
    protected finish: Promise<unknown> | undefined

    constructor(name: string, parent: Job | null) {
        this.name = name
        this.parent = parent
        this.nesting = parent == null ? -1 : parent.nesting + 1
        this.testNumber = parent == null ? 0 : parent.children.length + 1
    }

    // Takes a freshly declared child into the next slot. A child of a
    // settled parent is closed on the spot, with the verdict handed down.
    protected adopt<T extends Job>(child: T): T {
        // A child of a running parent may be reported before it starts.
        if (this.run != null) child.run = this.run
        this.children.push(child)
        const verdict = this.verdictForChildren
        if (verdict != null) child.close(verdict)
        return child
    }

    // What this job hands to a child it gives up on: the child is
    // cancelled. The root, with no result of its own, decides otherwise.
    protected get verdictForChildren(): Verdict | undefined {
        if (!this.settled) return undefined
        return {error: cancelledByParent(), outcome: "cancelled"}
    }

    // Takes the verdict a parent handed down. Whatever this job declares
    // from now on is closed on declaration, since it is settled.
    private close(verdict: Verdict): void {
        if (this.settled) return
        this.settled = true
        this.endedAt = performance.now()
        this.closedWith = verdict
        this.error = verdict.error
        this.cancelled = verdict.outcome === "cancelled"
    }

    // ---- lifecycle ----

    // Runs this job in its turn. Returns how it ended, for the parent's
    // own verdict; a parent that gave up already knows.
    async start(run: Run): Promise<Outcome> {
        this.run = run
        if (this.closedWith != null) return this.startClosed()
        this.started = true
        this.startedAt = performance.now()

        const closed = await this.runBody()
        // The parent gave up on this job while it ran and reports it, now
        // or once it reaches it: nothing more to say here either way.
        if (this.closedWith != null) return "cancelled"
        this.settle()

        await this.awaitReporting()
        for (const child of closed) await child.report()
        await this.report()
        this.onDone?.()
        return this.outcome
    }

    // What this job does in its turn, and the descendants it gave up on
    // for the caller to report. A bare job has nothing of its own to run.
    protected async runBody(): Promise<Job[]> {
        return []
    }

    // A job the parent gave up on before it started: there is nothing left
    // to run, only the verdict to report.
    protected async startClosed(): Promise<Outcome> {
        await this.report()
        return this.outcome
    }

    // A descendant that settled on its own may still be reporting. That is
    // bounded, and its results belong ahead of this job's and in the
    // counts, so they are waited for, through the descendants closed here.
    protected async awaitReporting(): Promise<void> {
        for (const child of this.children) {
            if (!child.started) continue
            if (child.closedWith != null) await child.awaitReporting()
            else if (child.settled) await child.finish
        }
    }

    // As the parent sees it.
    protected get outcome(): Outcome {
        if (this.error == null) return "passed"
        return this.cancelled ? "cancelled" : "failed"
    }

    // Decides the verdict, once, and closes whatever is still open below
    // with it handed down, deepest first. The list comes back for the
    // caller to report: a test reports its subtests here, running or
    // queued, while a suite reports its children as it starts each in turn.
    protected settle(error?: Error, timedOut = false): Job[] {
        if (this.settled) return []
        this.settled = true
        this.endedAt = performance.now()
        this.cancelled = timedOut && this.late == null
        if (error != null) this.error = this.late ?? error
        else if (this.late != null) this.error = this.late
        const closed: Job[] = []
        const verdict = this.verdictForChildren
        if (verdict != null) {
            const collect = (parent: Job, handed: Verdict): void => {
                for (const child of parent.children) {
                    if (child.settled) continue
                    collect(child, {error: cancelledByParent(), outcome: "cancelled"})
                    child.close(handed)
                    closed.push(child)
                }
            }
            collect(this, verdict)
        }
        return closed
    }

    // ---- reporting ----

    // Emits test:start for this job and the ancestors still pending, in
    // order. The reporter turns those into headings once a result arrives.
    protected async announce(): Promise<void> {
        if (this.announced) return
        this.announced = true
        if (this.parent != null) await this.parent.announce()
        if (this.nesting < 0) return
        await this.run.emit("test:start", {name: this.name, nesting: this.nesting})
    }

    // A bare job is not a test and has no result of its own to report.
    protected async report(): Promise<void> {
        return
    }
}
