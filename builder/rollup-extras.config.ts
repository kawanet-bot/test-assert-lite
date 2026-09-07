import sucrase from "@rollup/plugin-sucrase"
import type {RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

const rollupConfig: RollupOptions = {
    input: "../src/extras/extras.ts",

    // Every bare import stays external, the package's own name among
    // them; that one is rewritten below.
    external: [/^[^.\/]/],

    output: {
        file: "../dist/test-assert-lite.extras.mjs",
        format: "esm",
        // A bare self-reference from inside dist/ hits dist/package.json's
        // commonjs marker first and fails (no "exports" there), so the
        // bundle reads the library shipped beside it by relative path.
        paths: (id) => (id === "test-assert-lite" ? "./test-assert-lite.mjs" : id),
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
