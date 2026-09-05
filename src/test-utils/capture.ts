import type * as declared from "test-assert-lite"

// Collects the events that reached the reporter. It only replaces format,
// and since it yields nothing the output falls silent as a side effect.
// Where silence is all that is wanted, replace reporter.output() instead.
export const capture = (reporter: declared.TAL.Reporter): declared.TAL.TestEvent[] => {
    const events: declared.TAL.TestEvent[] = []
    reporter.format(async function* (source) {
        for await (const event of source) events.push(event)
    })
    return events
}

export const names = (events: declared.TAL.TestEvent[], type: string): string[] =>
    events.filter(e => e.type === type).map(e => (e.data as {name: string}).name)
