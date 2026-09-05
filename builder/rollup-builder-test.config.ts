import alias from "@rollup/plugin-alias"
import multiEntry from "@rollup/plugin-multi-entry"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

// Self-eating build: the suites are written against `node:test` and
// `node:assert`, and this config points those at the package itself, so the
// bundle exercises the library with the library.
const rollupConfig: RollupOptions = {
    input: ["../src/**/*.test.ts"],

    // Only the package name stays external. A regular expression such as
    // /^[^./]/ would externalise `node:test` before the alias plugin runs,
    // leaving the suites bound to the real runner without any warning.
    external: ["test-assert-lite"],

    output: {
        file: "./tests/bundled.mjs",
        format: "esm",
        // Nothing in the bundle calls run(), so the entry point is appended
        // here. A dynamic import reaches the same module instance as the
        // external import above, and avoids depending on bundled identifiers.
        // The bundle may already bind names such as `run`, so the entry point
        // stays anonymous rather than destructuring the namespace.
        outro: [
            "",
            'process.exitCode = (await (await import("test-assert-lite")).run()).success ? 0 : 1',
        ].join("\n"),
    },

    // Registration happens through side effects only. With tree shaking on,
    // rollup removes every describe() and it() call as unreachable.
    treeshake: false,

    plugins: [
        alias({
            entries: [
                {find: "node:test", replacement: "test-assert-lite"},
                {find: "node:assert", replacement: "test-assert-lite"},
                // The suites reach the subject by relative path so they run on
                // the sources directly under `node --test`. Only the entry is
                // listed: anything else stays inlined, which is what a helper
                // such as src/test-utils/capture.ts needs.
                {find: "./index.ts", replacement: "test-assert-lite"},
                {find: "./../index.ts", replacement: "test-assert-lite"},
            ],
        }),

        multiEntry(),

        sucrase({
            disableESTransforms: true,
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),

        showFiles(),
    ],
}

export default rollupConfig
