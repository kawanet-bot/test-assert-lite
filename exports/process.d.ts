// Declarations for process.js, typed off ProcessAPI so they cannot drift.
import type {TAL} from "test-assert-lite"

export declare const argv: TAL.ProcessAPI["argv"]
export declare const stdout: TAL.ProcessAPI["stdout"]
export declare const stderr: TAL.ProcessAPI["stderr"]
export declare const connect: TAL.ProcessAPI["connect"]
