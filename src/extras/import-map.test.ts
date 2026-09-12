import {strict as assert} from "node:assert"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {after, before, describe, it} from "node:test"
import {pathToFileURL} from "node:url"
import {aliasOf, importMapOf, importsOfMap} from "./import-map.ts"
import {readOptions} from "./options.ts"

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

    // No file is read here, so the base a relative address resolves against
    // is given as one: what it points at need not exist.
    describe("importsOfMap", () => {
        const base = pathToFileURL(resolve("maps", "x.json"))

        it("resolves a relative address against the base, and passes / and a URL through", () => {
            assert.deepEqual(importsOfMap({imports: {"lib": "./lib/x.js", "up": "../y.js", "root": "/vendor/z.js", "cdn": "https://cdn.example/w.js", "node:crypto": "./sha256.mjs", "https://cdn.example/lib.js": "./local.mjs"}}, base), [
                {specifier: "lib", file: resolve("maps", "lib", "x.js")},
                {specifier: "up", file: resolve("y.js")},
                {specifier: "root", url: "/vendor/z.js"},
                {specifier: "cdn", url: "https://cdn.example/w.js"},
                {specifier: "node:crypto", file: resolve("maps", "sha256.mjs")},
                {specifier: "https://cdn.example/lib.js", file: resolve("maps", "local.mjs")},
            ])
            assert.deepEqual(importsOfMap({}, base), [])
        })

        it("refuses what it does not take, naming the option and the key", () => {
            assert.throws(() => importsOfMap([], base), /--import-map: not an object$/)
            assert.throws(() => importsOfMap({imports: {}, scopes: {}}, base), /--import-map: only "imports" is supported: "scopes"$/)
            assert.throws(() => importsOfMap({imports: []}, base), /--import-map: not an object: "imports"$/)
            assert.throws(() => importsOfMap({imports: {a: 1}}, base), /--import-map: not a string: "a"$/)
            assert.throws(() => importsOfMap({imports: {"a/": "./a/"}}, base), /--import-map: no prefix entry or relative key: "a\/"$/)
            assert.throws(() => importsOfMap({imports: {"./a": "./a.js"}}, base), /--import-map: no prefix entry or relative key: "\.\/a"$/)
            assert.throws(() => importsOfMap({imports: {a: "lodash"}}, base), /--import-map: an address starts with \.\/, \.\.\/, \/ or a scheme: "a"$/)
        })
    })

    // What reading adds: the file itself, and its location as the base.
    describe("importMapOf", () => {
        it("resolves a relative address against the file it was read from", async () => {
            assert.deepEqual(importMapOf(await map("a.json", '{"imports": {"lib": "./lib/x.js", "up": "../y.js"}}')), [
                {specifier: "lib", file: join(dir, "maps", "lib", "x.js")},
                {specifier: "up", file: join(dir, "y.js")},
            ])
        })

        it("refuses what it cannot read or parse, naming the option", async () => {
            assert.throws(() => importMapOf(join(dir, "maps", "none.json")), /--import-map: ENOENT/)
            const bad = await map("bad.json", '{"imports": {"a": "./a.js",}}')
            assert.throws(() => importMapOf(bad), /--import-map: .*JSON/)
        })
    })

    describe("aliasOf", () => {
        it("splits at the first = and resolves the file", () => {
            assert.deepEqual(aliasOf("mod=lib/mod.mjs"), {specifier: "mod", file: resolve("lib/mod.mjs")})
            assert.deepEqual(aliasOf("a=b=c.mjs"), {specifier: "a", file: resolve("b=c.mjs")})
        })

        it("refuses an entry without a specifier or a file", () => {
            for (const entry of ["mod", "=mod.mjs", "mod="]) {
                assert.throws(() => aliasOf(entry), /--alias takes <specifier>=<file>: /)
            }
        })
    })

    // Nothing reaches importsOf but readOptions, so what it settles is read back from there.
    describe("importsOf", () => {
        it("is read by readOptions before --alias in both modes, and a page's address refused in Node mode", async () => {
            assert.throws(() => readOptions(["--import-map", join(dir, "maps", "none.json"), "a.test.ts"]), /--import-map: ENOENT/)
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
            assert.throws(() => readOptions(["--import-map", urls, "a.test.ts"]), /apply to --playwright, --webdriver and --serve only: "root"$/)
            const taken = readOptions(["--import-map", urls, "--alias", "root=x.mjs", "a.test.ts"])
            assert.equal(taken.mode, "node")
            if (taken.mode !== "node") return
            assert.deepEqual(taken.imports, [{specifier: "root", file: resolve("x.mjs")}])
            assert.equal(readOptions(["--serve", "--import-map", urls, "suite.mjs"]).mode, "serve")
        })
    })
})
