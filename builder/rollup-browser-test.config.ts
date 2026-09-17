import json from "@rollup/plugin-json"
import alias from "@rollup/plugin-alias"
import multiEntry from "@rollup/plugin-multi-entry"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

// Bundles the test suites for the browser as one ES module. node:test and
// node:assert stay as written: the page the CLI serves
// carries an import map that points them, and the package name, at the
// minified build, so no glue module is inlined here.
const rollupConfig: RollupOptions = {
    // 90.* pin the entries through require() and the package paths, Node
    // APIs a page has none of, so the negative pattern keeps them out here.
    // src/extras/ tests exercise Node-only code such as the HTTP server.
    input: ["../src/**/*.test.ts", "!../src/90.*", "!../src/extras/*"],

    // Left to the import map. Listed by name rather than by pattern so the
    // alias below still sees the relative entry imports first.
    external: [
        "test-assert-lite",
        "test-assert-lite/assert",
        "test-assert-lite/assert/strict",
        "test-assert-lite/reporter/html",
        "test-assert-lite/reporter/spec",
        "test-assert-lite/reporter/tap",
        "test-assert-lite/session",
        "test-assert-lite/test",
        "node:assert",
        "node:assert/strict",
        "node:test",
    ],

    output: {
        file: "../browser/tests/bundled.mjs",
        format: "esm",
    },

    // Registration happens through side effects only. With tree shaking on,
    // rollup removes every describe() and it() call as unreachable.
    treeshake: false,

    plugins: [
        json(),

        // The suites reach the subject by relative path so they run on the
        // sources directly under `node --test`. Only the entry is matched,
        // whatever directory the suite sits in: anything else stays inlined,
        // which is what src/test-utils/ needs.
        alias({
            entries: [
                {find: /^(\.\.?\/)+index\.ts$/, replacement: "test-assert-lite"},
            ],
        }),

        multiEntry(),

        sucrase({
            disableESTransforms: true,
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),

        showFiles({deny: /\W(extras)\W/, gray: /\W(test)\W/}),
    ],
}

export default rollupConfig
