import json from "@rollup/plugin-json"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

const rollupConfig: RollupOptions = {
    input: "../src/extras/extras.ts",

    // Every bare import stays external, the package's own name among
    // them: from dist/ it resolves through the package's exports.
    external: [/^[^.\/]/],

    output: {
        file: "../dist/test-assert-lite.extras.js",
        format: "esm",
    },

    plugins: [
        json(),

        sucrase({
            disableESTransforms: true,
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),

        showFiles(),
    ],
}

export default rollupConfig
