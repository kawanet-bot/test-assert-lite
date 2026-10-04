import json from "@rollup/plugin-json"
import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

const rollupConfig: RollupOptions = {
    input: "../src/extras/extras.ts",

    // Every bare import stays external, the library's name among them:
    // it is a dependency of the CLI package, and resolves as one.
    external: [/^[^.\/]/],

    output: {
        file: "../packages/test-assert-cli/dist/test-assert-cli.js",
        format: "esm",
    },

    plugins: [
        json(),

        sucrase({
            disableESTransforms: true,
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),

        showFiles({deny: /\W(test)(?!-assert)\W/, gray: /\W(extras)\W/}),
    ],
}

export default rollupConfig
