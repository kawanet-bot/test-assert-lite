import sucrase from "@rollup/plugin-sucrase"
import type {Plugin, RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

// Whether the source shebang survives the pipeline depends on unrelated
// details (sucrase eats it along with the leading trivia of an elided
// type-only import). Strip it always, and let output.banner supply
// exactly one back.
const stripShebang = (): Plugin => ({
    name: "strip-shebang",
    transform: (code) => code.replace(/^#![^\n]*/, ""),
})

const rollupConfig: RollupOptions = {
    input: "../src/cli/test-assert-lite.cli.ts",

    // Every bare import stays external, the package's own name among
    // them; that one is rewritten below.
    external: [/^[^.\/]/],

    output: {
        file: "../dist/test-assert-lite.cli.mjs",
        format: "esm",
        // npm exposes bin entries as symlinks on POSIX, so the target
        // itself must carry the shebang to be executable from PATH.
        banner: "#!/usr/bin/env node",
        // A bare self-reference from inside dist/ hits dist/package.json's
        // commonjs marker first and fails (no "exports" there), so the CLI
        // reads the library bundle shipped beside it by relative path.
        paths: (id) => (id === "test-assert-lite" ? "./test-assert-lite.mjs" : id),
    },

    plugins: [
        sucrase({
            disableESTransforms: true,
            exclude: ["node_modules/**"],
            transforms: ["typescript"],
        }),

        stripShebang(),

        showFiles(),
    ],
}

export default rollupConfig
