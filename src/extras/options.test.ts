import {strict as assert} from "node:assert"
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {after, before, describe, it} from "node:test"
import {UsageError, aliasOf, browserOf, importMapOf, mountOf, originOf, portOf, readOptions} from "./options.ts"

// A UsageError with the reason it gives, or without one, as the usage
// text alone is the answer to some.
const refused = (fn: () => unknown, reason?: RegExp): void => {
    assert.throws(fn, (error: unknown) => {
        assert.ok(error instanceof UsageError)
        if (reason == null) assert.equal(error.message, "")
        else assert.match(error.message, reason)
        return true
    })
}

describe("extras/options", () => {
    describe("portOf", () => {
        it("takes a whole number a socket can have", () => {
            assert.equal(portOf("0"), 0)
            assert.equal(portOf("3000"), 3000)
            assert.equal(portOf("65535"), 65535)
        })

        it("refuses what is no port, with the value in the reason", () => {
            for (const value of ["65536", "-1", "3000.5", "port"]) {
                refused(() => portOf(value), /^--port takes a number from 0 to 65535: /)
            }
        })
    })

    describe("originOf", () => {
        it("takes scheme, host and port, as a URL reads them back", () => {
            assert.equal(originOf("http://tal.example:3000"), "http://tal.example:3000")
            assert.equal(originOf("https://tal.example:443/"), "https://tal.example")
            assert.equal(originOf("HTTP://Tal.Example/"), "http://tal.example")
            assert.equal(originOf("http://[::1]:3000/"), "http://[::1]:3000")
        })

        it("refuses another scheme, a path, a query, a fragment or credentials", () => {
            for (const value of ["tal.example", "tal.example:3000", "ftp://tal.example", "http://", "http://tal.example/base", "http://tal.example/?x", "http://tal.example/#f", "http://u:p@tal.example/"]) {
                refused(() => originOf(value), /^--origin takes http\(s\):\/\/host\[:port\]: /)
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

    describe("importMapOf", () => {
        let dir: string
        const map = async (name: string, json: string): Promise<string> => {
            const file = join(dir, "maps", name)
            await writeFile(file, json)
            return file
        }

        before(async () => {
            dir = await mkdtemp(join(tmpdir(), "tal-options-"))
            await mkdir(join(dir, "maps"))
        })

        after(async () => {
            await rm(dir, {recursive: true, force: true})
        })

        it("resolves a relative address against the file, and passes / and a URL through", async () => {
            const file = await map("a.json", '{"imports": {"lib": "./lib/x.js", "up": "../y.js", "root": "/vendor/z.js", "cdn": "https://cdn.example/w.js", "node:crypto": "./sha256.mjs"}}')
            assert.deepEqual(importMapOf(file), [
                {specifier: "lib", file: join(dir, "maps", "lib", "x.js")},
                {specifier: "up", file: join(dir, "y.js")},
                {specifier: "root", url: "/vendor/z.js"},
                {specifier: "cdn", url: "https://cdn.example/w.js"},
                {specifier: "node:crypto", file: join(dir, "maps", "sha256.mjs")},
            ])
            assert.deepEqual(importMapOf(await map("empty.json", "{}")), [])
        })

        it("refuses what it cannot read or does not take, naming the file", async () => {
            refused(() => importMapOf(join(dir, "maps", "none.json")), /^--import-map .*none\.json: ENOENT/)
            for (const [name, json, reason] of [
                ["bad.json", '{"imports": {"a": "./a.js",}}', /^--import-map .*bad\.json: /],
                ["list.json", "[]", /not an object$/],
                ["scopes.json", '{"imports": {}, "scopes": {}}', /only "imports" is supported: "scopes"$/],
                ["bare.json", '{"imports": {"a": "lodash"}}', /"a": an address starts with/],
                ["num.json", '{"imports": {"a": 1}}', /"a": not a string$/],
                ["prefix.json", '{"imports": {"a/": "./a/"}}', /"a\/": prefix and URL-like keys/],
                ["urlkey.json", '{"imports": {"./a": "./a.js"}}', /"\.\/a": prefix and URL-like keys/],
            ] as [string, string, RegExp][]) {
                const file = await map(name, json)
                refused(() => importMapOf(file), reason)
            }
        })

        it("reads --import-map before --alias in both modes, and refuses a page's address in Node mode", async () => {
            const file = await map("m.json", '{"imports": {"lib": "./lib.js", "mod": "./old.js"}}')
            const node = readOptions(["--import-map", file, "--alias", "mod=new.mjs", "a.test.ts"])
            assert.equal(node.mode, "node")
            if (node.mode !== "node") return
            assert.deepEqual(node.imports, [{specifier: "lib", file: join(dir, "maps", "lib.js")}, {specifier: "mod", file: join(dir, "maps", "old.js")}, {specifier: "mod", file: resolve("new.mjs")}])
            const served = readOptions(["--serve", "--import-map", file, "suite.mjs"])
            assert.equal(served.mode, "serve")
            if (served.mode !== "serve") return
            assert.deepEqual(served.imports.map(entry => entry.specifier), ["lib", "mod"])
            const urls = await map("urls.json", '{"imports": {"root": "/x.js"}}')
            refused(() => readOptions(["--import-map", urls, "a.test.ts"]), /apply to --playwright, --webdriver and --serve only: "root"$/)
            assert.equal(readOptions(["--serve", "--import-map", urls, "suite.mjs"]).mode, "serve")
        })
    })

    describe("browserOf", () => {
        it("takes one of Playwright's three, and nothing else", () => {
            assert.equal(browserOf("chromium"), "chromium")
            assert.equal(browserOf("firefox"), "firefox")
            assert.equal(browserOf("webkit"), "webkit")
            refused(() => browserOf("electron"), /^--playwright takes chromium, firefox or webkit: electron$/)
        })
    })

    describe("mountOf", () => {
        it("resolves a directory, and takes an http(s) URL as given up to its path, ending in a slash", () => {
            assert.equal(mountOf("site"), resolve("site"))
            assert.equal(mountOf("http://127.0.0.1:5173"), "http://127.0.0.1:5173/")
            assert.equal(mountOf("HTTPS://Example.com/app"), "https://example.com/app/")
            assert.equal(mountOf("http://x/app/"), "http://x/app/")
        })

        it("refuses a URL with a query, a fragment or credentials", () => {
            for (const value of ["http://x/?q=1", "http://x/#top", "http://u:p@x/", "http://"]) {
                refused(() => mountOf(value), /^--mount takes a directory or http\(s\):\/\/host\[:port\]\[\/path\]: /)
            }
        })
    })

    describe("readOptions", () => {
        it("reads --help ahead of anything else, and -h as --help", () => {
            assert.deepEqual(readOptions(["--help"]), {mode: "help"})
            assert.deepEqual(readOptions(["-h"]), {mode: "help"})
            assert.deepEqual(readOptions(["--help", "--serve", "--webdriver"]), {mode: "help"})
        })

        it("reads --version and -v, after --help", () => {
            assert.deepEqual(readOptions(["--version"]), {mode: "version"})
            assert.deepEqual(readOptions(["-v", "--serve", "suite.mjs"]), {mode: "version"})
            assert.deepEqual(readOptions(["-v", "-h"]), {mode: "help"})
        })

        it("reads Node mode as the default, the files resolved in order", () => {
            assert.deepEqual(readOptions(["a.test.ts", "b.test.ts"]), {mode: "node", suites: [resolve("a.test.ts"), resolve("b.test.ts")], imports: []})
        })

        it("refuses Node mode without a file, and with a CommonJS one", () => {
            refused(() => readOptions([]))
            refused(() => readOptions(["a.test.ts", "b.cjs", "c.cts"]), /^CommonJS suites are not supported: b\.cjs, c\.cts$/)
        })

        it("reads --serve: the suite resolved, nothing else set", () => {
            assert.deepEqual(readOptions(["--serve", "suite.mjs"]), {
                mode: "serve",
                suites: [resolve("suite.mjs")],
                scripts: [],
                imports: [],
                mount: undefined,
                host: undefined,
                port: undefined,
                origin: undefined,
            })
        })

        it("reads --host as given, --port and --origin checked and normalized", () => {
            const options = readOptions(["--serve", "--host", "0.0.0.0", "--port", "3000", "--origin", "https://tal.example:443/", "suite.mjs"])
            assert.equal(options.mode, "serve")
            if (options.mode !== "serve") return
            assert.equal(options.host, "0.0.0.0")
            assert.equal(options.port, 3000)
            assert.equal(options.origin, "https://tal.example")
            refused(() => readOptions(["--serve", "--port", "port", "suite.mjs"]), /^--port takes/)
            refused(() => readOptions(["--serve", "--origin", "tal.example", "suite.mjs"]), /^--origin takes/)
        })

        it("reads --script and --alias, each resolved, in order", () => {
            const options = readOptions(["--serve", "--script", "a.js", "--alias", "mod=m.mjs", "--script", "b.js", "suite.mjs"])
            assert.equal(options.mode, "serve")
            if (options.mode !== "serve") return
            assert.deepEqual(options.scripts, [resolve("a.js"), resolve("b.js")])
            assert.deepEqual(options.imports, [{specifier: "mod", file: resolve("m.mjs")}])
            refused(() => readOptions(["--serve", "--alias", "mod", "suite.mjs"]), /^--alias takes/)
        })

        it("reads --alias in Node mode too", () => {
            const options = readOptions(["--alias", "node:crypto=sha256.mjs", "a.test.ts"])
            assert.equal(options.mode, "node")
            if (options.mode !== "node") return
            assert.deepEqual(options.imports, [{specifier: "node:crypto", file: resolve("sha256.mjs")}])
        })

        it("reads --playwright with its browser", () => {
            const options = readOptions(["--playwright", "webkit", "suite.mjs"])
            assert.equal(options.mode, "playwright")
            if (options.mode !== "playwright") return
            assert.equal(options.browser, "webkit")
            assert.deepEqual(options.suites, [resolve("suite.mjs")])
            refused(() => readOptions(["--playwright", "electron", "suite.mjs"]), /^--playwright takes/)
        })

        it("reads --webdriver with its session file and endpoint, the endpoint on loopback by default", () => {
            const options = readOptions(["--webdriver", "suite.mjs"])
            assert.equal(options.mode, "webdriver")
            if (options.mode !== "webdriver") return
            assert.equal(options.session, undefined)
            assert.equal(options.endpoint, "http://127.0.0.1:4444")
            const given = readOptions(["--webdriver", "--webdriver-session", "s.json", "--endpoint", "http://127.0.0.1:9515", "suite.mjs"])
            assert.equal(given.mode, "webdriver")
            if (given.mode !== "webdriver") return
            assert.equal(given.session, "s.json")
            assert.equal(given.endpoint, "http://127.0.0.1:9515")
        })

        it("refuses two of --playwright, --webdriver and --serve", () => {
            refused(() => readOptions(["--playwright", "chromium", "--serve", "suite.mjs"]), /are exclusive$/)
            refused(() => readOptions(["--webdriver", "--serve", "suite.mjs"]), /are exclusive$/)
            refused(() => readOptions(["--playwright", "chromium", "--webdriver", "suite.mjs"]), /are exclusive$/)
        })

        it("refuses the server's and the page's flags in Node mode", () => {
            for (const flags of [["--host", "x"], ["--port", "3000"], ["--origin", "http://x"], ["--script", "s.js"], ["--mount", "site"]]) {
                refused(() => readOptions([...flags, "a.test.ts"]), /apply to --playwright, --webdriver and --serve only$/)
            }
        })

        it("refuses the WebDriver flags outside --webdriver", () => {
            refused(() => readOptions(["--serve", "--webdriver-session", "s.json", "suite.mjs"]), /apply to --webdriver only$/)
            refused(() => readOptions(["--playwright", "chromium", "--endpoint", "http://x", "suite.mjs"]), /apply to --webdriver only$/)
            refused(() => readOptions(["--endpoint", "http://x", "a.test.ts"]), /apply to --webdriver only$/)
        })

        it("refuses a browser mode with no suite", () => {
            refused(() => readOptions(["--serve"]))
            refused(() => readOptions(["--playwright", "chromium", "--mount", "site"]))
        })

        it("reads several suites in a browser mode from one directory, in order, and refuses them from two", () => {
            const options = readOptions(["--serve", "test/b.mjs", "./test/a.mjs", "test/b.mjs", "test/sub/c.mjs"])
            assert.equal(options.mode, "serve")
            if (options.mode !== "serve") return
            assert.deepEqual(options.suites, [resolve("test/b.mjs"), resolve("test/a.mjs"), resolve("test/b.mjs"), resolve("test/sub/c.mjs")])
            refused(() => readOptions(["--serve", "test/a.mjs", "other/b.mjs"]), /^--playwright, --webdriver and --serve take the suites from one directory$/)
            refused(() => readOptions(["--playwright", "chromium", "x/a.mjs", "test/b.mjs"]), /from one directory$/)
            refused(() => readOptions(["--serve", "test/a/x.mjs", "test/b/y.mjs"]), /from one directory$/)
        })

        it("counts a suite's directory under a script's or an alias's as that one", () => {
            const options = readOptions(["--serve", "--alias", "lib=test/lib.mjs", "test/a/x.mjs", "test/b/y.mjs"])
            assert.equal(options.mode, "serve")
            assert.equal(readOptions(["--serve", "--script", "test/setup.js", "test/a/x.mjs", "test/b/y.mjs"]).mode, "serve")
        })

        it("lets --serve with --mount go without a suite", () => {
            const options = readOptions(["--serve", "--mount", "site"])
            assert.equal(options.mode, "serve")
            assert.deepEqual((options as {suites?: string[]}).suites, [])
            assert.equal((options as {mount?: string}).mount, resolve("site"))
        })

        it("refuses a flag it does not know, and a flag missing its value", () => {
            refused(() => readOptions(["--watch", "suite.mjs"]))
            refused(() => readOptions(["--serve", "--port"]))
        })
    })
})
