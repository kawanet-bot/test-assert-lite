import sucrase from "@rollup/plugin-sucrase"
import {fileURLToPath} from "node:url"
import type {Plugin, RollupOptions} from "rollup"
import {showFiles} from "./show-files.ts"

// Rollup normalizes a relative external id to an absolute path before
// output.paths sees it, even though external already kept it from being
// read. Resolved once here so both options key off the same path.
const indexTs = fileURLToPath(new URL("../src/index.ts", import.meta.url))

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

    // A bare self-reference from inside dist/ hits dist/package.json's
    // commonjs marker first and fails (no "exports" there); a relative
    // import skips package resolution entirely, so it is unaffected.
    external: [/^[^.\/]/, "../index.ts"],

    output: {
        file: "../dist/test-assert-lite.cli.mjs",
        format: "esm",
        // npm exposes bin entries as symlinks on POSIX, so the target
        // itself must carry the shebang to be executable from PATH.
        banner: "#!/usr/bin/env node",
        // Rewrites the external src/index.ts import to the library bundle
        // this build ships alongside it in dist/.
        paths: (id) => (id === indexTs ? "./test-assert-lite.mjs" : id),
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
