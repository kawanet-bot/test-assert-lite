import json from "@rollup/plugin-json"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

const rollupConfig: RollupOptions = {
    input: "../src/extras/extras.ts",

    // Every bare import stays external, the package's own name among
    // them: from esm/ it resolves through the package's exports.
    external: [/^[^.\/]/],

    output: {
        file: "../esm/test-assert-lite.extras.mjs",
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
