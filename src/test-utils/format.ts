import type {TAL} from "test-assert-lite"

type TestEvent = TAL.TestEvent
type ReporterFn = TAL.ReporterFn

export type Emit = (type: string, data: TestEvent["data"]) => Promise<void>

// Runs a reporter over the events `send` emits, as the runner would, and
// returns everything it wrote. The reporter tests drive spec/tap/html this way.
export const formatEvents = async (reporter: ReporterFn, send: (emit: Emit) => Promise<void>): Promise<string> => {
    const events: TestEvent[] = []
    await send(async (type, data) => {
        events.push({type, data} as TestEvent)
    })
    let out = ""
    for await (const text of reporter((async function* () {
        yield* events
    })())) out += text
    return out
}
