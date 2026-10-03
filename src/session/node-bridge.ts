// The bridge of a run under Node with no CLI to report to: the process
// itself. Text goes to its streams. A failed verdict nobody in the process
// reads becomes its exit code, as node --test leaves one. A caller that
// opened the session and ran it has the result, and the exit code is theirs.

import type {TAL} from "test-assert-lite"

/** The parts of a Node process the bridge speaks to. */
export interface ProcessLike {
    stdout: TAL.Writer
    stderr: TAL.Writer
    exitCode?: number | string | null | undefined
}

const NOP = () => undefined

/** `unattended` says whether the verdict has no reader in the process when it comes. */
export const nodeBridge = (proc: ProcessLike, unattended: () => boolean = () => true): TAL.BridgeAPI => ({
    stdout: proc.stdout,
    stderr: proc.stderr,
    send: (message, callback = NOP) => {
        if (message.type === "session:end" && !message.data.success && unattended()) proc.exitCode = 1
        callback(null)
    },
    disconnect: NOP,
})
