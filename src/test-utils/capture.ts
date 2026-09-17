import type {TAL} from "test-assert-lite"

// Collects the events that reached the reporter, through a session whose
// reporter yields nothing, so the output falls silent as a side effect.
// Where silence is all that is wanted, open the session with an output.
export const capture = (harness: TAL.TestHarness, options: Omit<TAL.SessionOptions, "reporter"> = {}): TAL.TestEvent[] => {
    const events: TAL.TestEvent[] = []
    harness.session.session({
        ...options,
        reporter: async function* (source) {
            for await (const event of source) events.push(event)
        },
    })
    return events
}

// The run's counts, from the summary event: what end() no longer returns.
export const summaryOf = (events: TAL.TestEvent[]): TAL.TestSummary => {
    const summary = events.find(e => e.type === "test:summary")
    if (summary?.type !== "test:summary") throw new Error("no test:summary event")
    return summary.data
}

export const names = (events: TAL.TestEvent[], type: string): string[] =>
    events.filter(e => e.type === type).map(e => (e.data as {name: string}).name)

type TestEvent = TAL.TestEvent

// Narrows to one event type so a test can read its data without casting.
export const ofType = <T extends TestEvent["type"]>(events: TestEvent[], type: T): Extract<TestEvent, {type: T}>[] =>
    events.filter((e): e is Extract<TestEvent, {type: T}> => e.type === type)
