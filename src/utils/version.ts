// The library's version, for the run's report: one
// source, package.json, inlined by the build and read as is under Node.
import pkg from "../../packages/test-assert-lite/package.json" with {type: "json"}

export const VERSION: string = pkg.version
