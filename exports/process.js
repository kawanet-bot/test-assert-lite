// The process as a script sees it: argv, stdout and stderr, as
// node:process has them, and connect(), which makes the channel to the
// host. The default is the whole of it, as node:process has one.
import {sharedTAL} from "test-assert-lite"

export const {argv, connect, stdout, stderr} = sharedTAL.proc
export default sharedTAL.proc
