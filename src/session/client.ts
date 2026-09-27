// The page's bridge to the CLI, over the fetch it is given. Text is
// buffered per stream and sent in one request per flush, so a burst of a
// hundred lines is one round trip. A change of stream, or a message,
// flushes first, so the CLI gets everything in the order it was written.

import type {TAL} from "test-assert-lite"
import {delayedBufWriter} from "../utils/buf-writer.ts"
import {getStreams, type RunServicesOptions} from "../utils/run-services.ts"

interface BridgeIPC {
    stdout: (chunk: string) => Promise<unknown>
    stderr: (chunk: string) => Promise<unknown>
    send: (message: TAL.SessionEvent) => Promise<unknown>
}

// How long lines gather before a flush: a test's burst of output becomes
// one request, while a person watching still sees it as it comes.
const FLUSH_MS = 50

// A quiet page says so every ten seconds, on stderr: the CLI takes any
// word within its own, longer bound as proof the page is alive, and a
// person watching sees a long test is still going rather than hung. The
// check runs each second, so the line lands on time rather than a beat late.
const QUIET_MS = 10_000
const TICK_MS = 1_000

const NOP = () => undefined

const onWrite = (writer: TAL.Writer, fn: () => void): TAL.Writer => {
    return {
        write: (chunk: string) => {
            writer.write(chunk)
            fn()
        },
    }
}

// What stands in for a bridge when the run has none.
export const defaultBridge = (defaults?: RunServicesOptions): TAL.BridgeAPI => {
    const {stdout, stderr} = getStreams(defaults)
    return {
        stdout,
        stderr,
        send: (_, callback = NOP) => callback(null),
        disconnect: NOP,
    }
}

// The alive line while the page is quiet, for one run. Its disconnect
// ends the line, then the bridge's own.
export const heartbeatBridge = (client: TAL.BridgeAPI): TAL.BridgeAPI => {
    let last = 0
    const tack = () => (last = Date.now())

    const {stdout, stderr} = client
    let started = tack()

    const tick = (): void => {
        if (Date.now() - last < QUIET_MS) return
        stderr.write(`⏳ ${Math.round((Date.now() - started) / 1000)}s\n`)
        tack()
    }

    let alive: ReturnType<typeof setInterval> | null = setInterval(tick, TICK_MS)

    return {
        stdout: onWrite(stdout, tack),
        stderr: onWrite(stderr, tack),
        send: (message, callback) => client.send(message, callback),
        disconnect: () => {
            if (alive != null) clearInterval(alive)
            alive = null
            client.disconnect()
        },
    }
}

// Gathers each stream for a flush. The other stream and send() flush it
// first, so nothing overtakes what was written before it.
const bufferedBridge = (client: TAL.BridgeAPI): TAL.BridgeAPI => {
    const stdout = delayedBufWriter(client.stdout, FLUSH_MS)
    const stderr = delayedBufWriter(client.stderr, FLUSH_MS)

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
            client.send(message, callback)
        },
        disconnect: () => client.disconnect(),
    }
}

// What connect() gives: the fetch, kept in order, then buffered.
export const bridgeFromFetch = (fetch: TAL.FetchLike): TAL.BridgeAPI => {
    return bufferedBridge(inOrderBridge(ipcFromFetch(fetch)))
}

const inOrderBridge = (bridge: BridgeIPC): TAL.BridgeAPI => {
    // Every request follows the one before, so each stream stays in order.
    let inflight: Promise<unknown> = Promise.resolve()

    // Request failures are ignored. Later requests are still attempted.
    const chain = (fn: () => Promise<unknown>): Promise<unknown> => {
        return inflight = inflight.catch(NOP).then(fn)
    }

    return {
        stdout: {write: (chunk) => void chain(() => bridge.stdout(chunk)).catch(NOP)},
        stderr: {write: (chunk) => void chain(() => bridge.stderr(chunk)).catch(NOP)},
        send: (message, callback = NOP) => void chain(() => bridge.send(message)).then(() => callback(null), callback),
        disconnect: NOP,
    }
}

// One POST per channel, by a path relative to the page.
const ipcFromFetch = (fetch: TAL.FetchLike): BridgeIPC => {
    return {
        stdout: chunk => fetch("stdout", {method: "POST", body: chunk}),
        stderr: chunk => fetch("stderr", {method: "POST", body: chunk}),
        send: message => fetch("send", {method: "POST", body: JSON.stringify(message)}),
    }
}
