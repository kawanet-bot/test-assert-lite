// The realm's channel as one session uses it. A failed verdict leaves the
// process's exit code when the session has nobody to read it, as node
// --test leaves one. The session's disconnect leaves the channel open,
// since the channel is the realm's and outlives the session.

import type {TAL} from "test-assert-lite"
import type {ProcessLike} from "./node-channel.ts"

type SessionEventType = TAL.SessionEvent["type"]
type SessionEventData<T extends SessionEventType> = Extract<TAL.SessionEvent, {type: T}>["data"]
type SessionEventMap = {[T in SessionEventType]: (data: SessionEventData<T>) => void}

const NOP = () => undefined

/** `proc` is the process to leave the exit code on, or null when the session's caller holds the verdict. */
export const withExitCode = (channel: TAL.Channel, proc: ProcessLike | null): TAL.Channel => {
    const eventMap: SessionEventMap = {
        "session:begin": NOP,
        "session:end": (result) => {
            if (proc != null && !result.success) proc.exitCode = 1
        },
    }

    const receive = <T extends SessionEventType>(message: TAL.SessionEvent): void => {
        eventMap[message.type as T](message.data as SessionEventData<T>)
    }

    return {
        stdout: channel.stdout,
        stderr: channel.stderr,
        send: (message, callback) => {
            receive(message)
            channel.send(message, callback)
        },
        disconnect: NOP,
    }
}
