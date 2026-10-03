// The process as a script sees it: argv, stdout and stderr, as
// node:process has them, and connect(), which makes the channel to the
// host. No default: what is not here is not offered, and a default would
// stand for all of process.
import {sharedTAL} from "test-assert-lite"

export const {argv, connect, stdout, stderr} = sharedTAL.proc
