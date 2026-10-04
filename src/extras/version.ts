// The command line's own version, for -v: one source, its package.json,
// inlined by the build and read as is under Node.
import pkg from "../../packages/test-assert-cli/package.json" with {type: "json"}

export const VERSION: string = pkg.version
