import type * as declared from "test-assert-lite"

type TestEvent = declared.TAL.TestEvent
type FormatFn = declared.TAL.FormatFn

export type Emit = (type: string, data: TestEvent["data"]) => Promise<void>

// Runs a formatter over the events `send` emits, as the runner would, and
// returns everything it wrote. The reporter tests drive spec/tap/html this way.
export const formatEvents = async (format: FormatFn, send: (emit: Emit) => Promise<void>): Promise<string> => {
    const events: TestEvent[] = []
    await send(async (type, data) => {
        events.push({type, data} as TestEvent)
    })
    let out = ""
    for await (const text of format((async function* () {
        yield* events
    })())) out += text
    return out
}
