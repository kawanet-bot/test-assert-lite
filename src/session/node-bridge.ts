// The bridge of a run under Node with no CLI to report to is the process
// itself. Text goes to its streams. The events the session sends are
// received here, as a page's are by the CLI. A failed verdict of a session
// nobody opened becomes the exit code, as node --test leaves one.

import type {TAL} from "test-assert-lite"

/** The parts of a Node process the bridge speaks to. */
export interface ProcessLike {
    stdout: TAL.Writer
    stderr: TAL.Writer
    exitCode?: number | string | null | undefined
}

type SessionEventType = TAL.SessionEvent["type"]
type SessionEventData<T extends SessionEventType> = Extract<TAL.SessionEvent, {type: T}>["data"]
type SessionEventMap = {[T in SessionEventType]: (data: SessionEventData<T>) => void}

const NOP = () => undefined

/** `auto` says the session was opened by a declaration, so nobody holds its result. */
export const nodeBridge = (proc: ProcessLike, auto: boolean): TAL.BridgeAPI => {
    const eventMap: SessionEventMap = {
        "session:begin": NOP,
        "session:end": (result) => {
            if (auto && !result.success) proc.exitCode = 1
        },
    }

    const receive = <T extends SessionEventType>(message: TAL.SessionEvent): void => {
        eventMap[message.type as T](message.data as SessionEventData<T>)
    }

    return {
        stdout: proc.stdout,
        stderr: proc.stderr,
        send: (message, callback = NOP) => {
            receive(message)
            callback(null)
        },
        disconnect: NOP,
    }
}
