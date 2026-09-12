import {strict as assert} from "node:assert"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {after, before, describe, it} from "node:test"
import {aliasOf, importMapOf} from "./import-map.ts"
import {readOptions} from "./options.ts"
import {UsageError} from "./usage-error.ts"

// A UsageError with the reason it gives.
const refused = (fn: () => unknown, reason: RegExp): void => {
    assert.throws(fn, (error: unknown) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, reason)
        return true
    })
}

describe("extras/import-map", () => {
    let dir: string
    const map = async (name: string, json: string): Promise<string> => {
        const file = join(dir, "maps", name)
        await writeFile(file, json)
        return file
    }

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), "tal-import-map-"))
        await mkdir(join(dir, "maps"))
    })

    after(async () => {
        await rm(dir, {recursive: true, force: true})
    })

    describe("importMapOf", () => {
        it("resolves a relative address against the file, and passes / and a URL through", async () => {
            const file = await map("a.json", '{"imports": {"lib": "./lib/x.js", "up": "../y.js", "root": "/vendor/z.js", "cdn": "https://cdn.example/w.js", "node:crypto": "./sha256.mjs", "https://cdn.example/lib.js": "./local.mjs"}}')
            assert.deepEqual(importMapOf(file), [
                {specifier: "lib", file: join(dir, "maps", "lib", "x.js")},
                {specifier: "up", file: join(dir, "y.js")},
                {specifier: "root", url: "/vendor/z.js"},
                {specifier: "cdn", url: "https://cdn.example/w.js"},
                {specifier: "node:crypto", file: join(dir, "maps", "sha256.mjs")},
                {specifier: "https://cdn.example/lib.js", file: join(dir, "maps", "local.mjs")},
            ])
            assert.deepEqual(importMapOf(await map("empty.json", "{}")), [])
        })

        it("refuses what it cannot read or does not take, naming the option", async () => {
            refused(() => importMapOf(join(dir, "maps", "none.json")), /^--import-map: ENOENT/)
            for (const [name, json, reason] of [
                ["bad.json", '{"imports": {"a": "./a.js",}}', /^--import-map: .*JSON/],
                ["list.json", "[]", /^--import-map: not an object$/],
                ["scopes.json", '{"imports": {}, "scopes": {}}', /^--import-map: only "imports" is supported: "scopes"$/],
                ["bare.json", '{"imports": {"a": "lodash"}}', /^--import-map: an address starts with \.\/, \.\.\/, \/ or a scheme: "a"$/],
                ["num.json", '{"imports": {"a": 1}}', /^--import-map: not a string: "a"$/],
                ["prefix.json", '{"imports": {"a/": "./a/"}}', /^--import-map: no prefix entry or relative key: "a\/"$/],
                ["relkey.json", '{"imports": {"./a": "./a.js"}}', /^--import-map: no prefix entry or relative key: "\.\/a"$/],
            ] as [string, string, RegExp][]) {
                const file = await map(name, json)
                refused(() => importMapOf(file), reason)
            }
        })
    })

    describe("aliasOf", () => {
        it("splits at the first = and resolves the file", () => {
            assert.deepEqual(aliasOf("mod=lib/mod.mjs"), {specifier: "mod", file: resolve("lib/mod.mjs")})
            assert.deepEqual(aliasOf("a=b=c.mjs"), {specifier: "a", file: resolve("b=c.mjs")})
        })

        it("refuses an entry without a specifier or a file", () => {
            for (const entry of ["mod", "=mod.mjs", "mod="]) {
                refused(() => aliasOf(entry), /^--alias takes <specifier>=<file>: /)
            }
        })
    })

    // Nothing reaches importsOf but readOptions, so what it settles is read back from there.
    describe("importsOf", () => {
        it("is read by readOptions before --alias in both modes, and a page's address refused in Node mode", async () => {
            refused(() => readOptions(["--import-map", join(dir, "maps", "none.json"), "a.test.ts"]), /^--import-map: ENOENT/)
            const file = await map("m.json", '{"imports": {"lib": "./lib.js", "mod": "./old.js"}}')
            const node = readOptions(["--import-map", file, "--alias", "mod=new.mjs", "a.test.ts"])
            assert.equal(node.mode, "node")
            if (node.mode !== "node") return
            assert.deepEqual(node.imports, [{specifier: "lib", file: join(dir, "maps", "lib.js")}, {specifier: "mod", file: resolve("new.mjs")}])
            const served = readOptions(["--serve", "--import-map", file, "suite.mjs"])
            assert.equal(served.mode, "serve")
            if (served.mode !== "serve") return
            assert.deepEqual(served.imports.map(entry => entry.specifier), ["lib", "mod"])
            const urls = await map("urls.json", '{"imports": {"root": "/x.js"}}')
            refused(() => readOptions(["--import-map", urls, "a.test.ts"]), /apply to --playwright, --webdriver and --serve only: "root"$/)
            const taken = readOptions(["--import-map", urls, "--alias", "root=x.mjs", "a.test.ts"])
            assert.equal(taken.mode, "node")
            if (taken.mode !== "node") return
            assert.deepEqual(taken.imports, [{specifier: "root", file: resolve("x.mjs")}])
            assert.equal(readOptions(["--serve", "--import-map", urls, "suite.mjs"]).mode, "serve")
        })
    })
})
