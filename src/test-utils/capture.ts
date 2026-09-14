import type * as declared from "test-assert-lite"

// Collects the events that reached the reporter, through a session whose
// format yields nothing, so the output falls silent as a side effect.
// Where silence is all that is wanted, open the session with an output.
export const capture = (harness: declared.TAL.TestHarness, options: Omit<declared.TAL.SessionOptions, "format"> = {}): declared.TAL.TestEvent[] => {
    const events: declared.TAL.TestEvent[] = []
    harness.session({
        ...options,
        format: async function* (source) {
            for await (const event of source) events.push(event)
        },
    })
    return events
}

export const names = (events: declared.TAL.TestEvent[], type: string): string[] =>
    events.filter(e => e.type === type).map(e => (e.data as {name: string}).name)

type Event = declared.TAL.TestEvent

// Narrows to one event type so a test can read its data without casting.
export const ofType = <T extends Event["type"]>(events: Event[], type: T): Extract<Event, {type: T}>[] =>
    events.filter((e): e is Extract<Event, {type: T}> => e.type === type)
