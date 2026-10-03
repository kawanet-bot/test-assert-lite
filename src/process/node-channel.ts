// The channel of a run under Node with no host beyond itself is the
// process. Text goes to its streams, and the events the session sends
// have nobody to reach.

import type {TAL} from "test-assert-lite"

/** The parts of a Node process the channel speaks to. */
export interface ProcessLike {
    stdout: TAL.Writer
    stderr: TAL.Writer
    exitCode?: number | string | null | undefined
}

const NOP = () => undefined

export const nodeChannel = (proc: ProcessLike): TAL.Channel => ({
    stdout: proc.stdout,
    stderr: proc.stderr,
    send: (_, callback = NOP) => callback(null),
    disconnect: NOP,
})
