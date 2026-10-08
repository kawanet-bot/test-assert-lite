// The session's channel to its host, over the fetch it is given. Text is
// buffered per stream and sent in one request per flush, so a burst of a
// hundred lines is one round trip. A change of stream, or a message,
// flushes first, so the host gets everything in the order it was written.

import type {TAL} from "test-assert-lite"
import {delayedBufWriter} from "../utils/buf-writer.ts"

interface ChannelIPC {
    stdout: (chunk: string) => Promise<unknown>
    stderr: (chunk: string) => Promise<unknown>
    send: (message: TAL.SessionEvent) => Promise<unknown>
}

// The time lines gather before a flush. A test's burst of output becomes
// one request, while a person watching still sees it as it comes.
const FLUSH_MS = 50

// A quiet run says so on stderr, every ten seconds unless the session
// sets its own interval. The host takes any word within its own, longer
// bound as proof the session is alive, and a person watching sees a long
// test is still going rather than hung.
const HEARTBEAT_MS = 10_000

const NOP = () => undefined

const onWrite = (writer: TAL.Writer, fn: () => void): TAL.Writer => {
    return {
        write: (chunk: string) => {
            writer.write(chunk)
            fn()
        },
    }
}

// A channel for a run with no host. It writes to the streams given and
// sends the verdict to nobody.
export const consoleChannel = ({stdout, stderr}: Pick<TAL.Channel, "stdout" | "stderr">): TAL.Channel => ({
    stdout,
    stderr,
    send: (_, callback = NOP) => callback(null),
    disconnect: NOP,
})

// The alive line while the session is quiet, for one run. Its disconnect
// ends the line, then the channel's own.
export const withHeartbeat = (channel: TAL.Channel, heartbeat?: number): TAL.Channel => {
    heartbeat ??= HEARTBEAT_MS
    let last = 0
    const tack = () => (last = Date.now())

    const {stdout, stderr} = channel
    let started = tack()

    const tick = (): void => {
        if (Date.now() - last < heartbeat) return
        last = Date.now()
        stderr.write(`⏳ ${Math.round((last - started) / 1000)}s\n`)
    }

    // The check runs ten times per interval, so the line lands close to time.
    let alive: ReturnType<typeof setInterval> | null = setInterval(tick, heartbeat / 10)
    // Node's timer alone must not keep the process alive: a harness that
    // never reaches run(), as under another runner, still has to exit.
    alive.unref?.()

    return {
        stdout: onWrite(stdout, tack),
        stderr: onWrite(stderr, tack),
        send: (message, callback) => channel.send(message, callback),
        disconnect: () => {
            if (alive != null) clearInterval(alive)
            alive = null
            channel.disconnect()
        },
    }
}

// Gathers each stream for a flush. The other stream and send() flush it
// first, so nothing overtakes what was written before it.
const buffered = (channel: TAL.Channel): TAL.Channel => {
    const stdout = delayedBufWriter(channel.stdout, FLUSH_MS)
    const stderr = delayedBufWriter(channel.stderr, FLUSH_MS)

    return {
        stdout: {
            write: (chunk) => {
                stderr.flush()
                stdout.write(chunk)
            },
        },
        stderr: {
            write: (chunk) => {
                stdout.flush()
                stderr.write(chunk)
            },
        },
        send: (message, callback) => {
            stdout.flush()
            stderr.flush()
            channel.send(message, callback)
        },
        disconnect: () => channel.disconnect(),
    }
}

// The channel connect() gives: the fetch, kept in order, then buffered.
export const channelOverFetch = (f: typeof fetch): TAL.Channel => {
    return buffered(inOrder(ipcFromFetch(f)))
}

const inOrder = (ipc: ChannelIPC): TAL.Channel => {
    // Every request follows the one before, so each stream stays in order.
    let inflight: Promise<unknown> = Promise.resolve()

    // Request failures are ignored. Later requests are still attempted.
    const chain = (fn: () => Promise<unknown>): Promise<unknown> => {
        return inflight = inflight.catch(NOP).then(fn)
    }

    return {
        stdout: {write: (chunk) => void chain(() => ipc.stdout(chunk)).catch(NOP)},
        stderr: {write: (chunk) => void chain(() => ipc.stderr(chunk)).catch(NOP)},
        send: (message, callback = NOP) => void chain(() => ipc.send(message)).then(() => callback(null), callback),
        disconnect: NOP,
    }
}

// One POST per channel, by a path relative to the page.
const ipcFromFetch = (f: typeof fetch): ChannelIPC => {
    return {
        stdout: chunk => f("stdout", {method: "POST", body: chunk}),
        stderr: chunk => f("stderr", {method: "POST", body: chunk}),
        send: message => f("send", {method: "POST", body: JSON.stringify(message)}),
    }
}
