// node:process's shape, in the part a script writes to: the host's stdout
// and stderr, from the shared harness. No default: what is not here is
// not offered, and a default would stand for all of process.
import {sharedTAL} from "test-assert-lite"

export const {stdout, stderr} = sharedTAL.proc
