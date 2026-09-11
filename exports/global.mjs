// The package on its global: the ES module face of the IIFE build, what
// the browser test CLI serves in place of dist/test-assert-lite.mjs once
// dist/test-assert-lite.min.js has left its global, so the suites and the
// subpath bridges beside this exercise the build browsers actually get.

const {after, assert, before, createTAL, describe, it, reporter, run, strict, suite, test} = globalThis.TAL

export {after, assert, before, createTAL, describe, it, reporter, run, strict, suite, test}
