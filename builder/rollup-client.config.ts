import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

// The page's client for the CLI's run channel, built on its own: it has
// no dependency, not even on the library, so nothing is external.
const rollupConfig: RollupOptions = {
    input: "../src/client/client.ts",

    output: {
        file: "../dist/test-assert-lite.client.mjs",
        format: "esm",
    },

    plugins: [
        sucrase({
            disableESTransforms: true,
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),

        showFiles(),
    ],
}

export default rollupConfig
