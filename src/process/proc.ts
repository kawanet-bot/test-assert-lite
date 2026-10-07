// The process as a script and the session see it, one for the realm: the
// channel to the host, and the streams that lead there. Under Node the
// host is the process itself. A page has none until connect() gives it
// one, and writes to the console as found until then.

import type {TAL} from "test-assert-lite"
import {consoleWriters, saveConsole} from "../session/console.ts"
import {hasProcess} from "../utils/process.ts"
import {withExitCode} from "./exit-code.ts"
import {channelOverFetch, consoleChannel} from "./fetch-channel.ts"
import {nodeChannel} from "./node-channel.ts"

const globalConsole = globalThis.console

let channel: TAL.Channel

// One array for the realm's life, filled in place, so an import of it
// made before the host spoke reads the same.
const argv: string[] = []

const connect: TAL.ProcessAPI["connect"] = (options = {}) => {
    if (options.argv) {
        argv.splice(0, argv.length, ...options.argv)
    }
    if (options.fetch) {
        channel = channelOverFetch(options.fetch)
    } else if (hasProcess()) {
        channel = nodeChannel(process)
    } else {
        channel = consoleChannel(consoleWriters(globalConsole, saveConsole(globalConsole)))
    }
    return channel
}

connect()

/** The realm's channel for one session. The verdict leaves the exit code when nobody opened the session to read it. */
export const sessionChannel = (implicitSession: boolean): TAL.Channel => withExitCode(channel, hasProcess() && implicitSession ? process : null)

export const proc: TAL.ProcessAPI = {
    argv,
    stdout: {write: chunk => channel.stdout.write(chunk)},
    stderr: {write: chunk => channel.stderr.write(chunk)},
    connect,
}
