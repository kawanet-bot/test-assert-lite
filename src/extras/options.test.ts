import {strict as assert} from "node:assert"
import {resolve} from "node:path"
import {describe, it} from "node:test"
import type {SessionConfig} from "./mode-options.ts"
import {engineNameOf, mountOf, originOf, portOf, readOptions} from "./options.ts"

const TITLE = "extras/options.test.ts"

describe(TITLE, () => {
    describe("portOf", () => {
        it("takes a whole number a socket can have", () => {
            assert.equal(portOf("0"), 0)
            assert.equal(portOf("3000"), 3000)
            assert.equal(portOf("65535"), 65535)
        })

        it("refuses what is no port, with the value in the reason", () => {
            for (const value of ["65536", "-1", "3000.5", "port", "0x50", "1e3", "", " 3000 "]) {
                assert.throws(() => portOf(value), /--port takes a number from 0 to 65535: /)
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
                assert.throws(() => originOf(value), /--origin takes http\(s\):\/\/host\[:port\]: /)
            }
        })
    })

    describe("engineNameOf", () => {
        it("takes one of Playwright's three, and nothing else", () => {
            assert.equal(engineNameOf("chromium"), "chromium")
            assert.equal(engineNameOf("firefox"), "firefox")
            assert.equal(engineNameOf("webkit"), "webkit")
            assert.throws(() => engineNameOf("electron"), /--playwright takes chromium, firefox or webkit: electron$/)
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
                assert.throws(() => mountOf(value), /--mount takes a directory or http\(s\):\/\/host\[:port\]\[\/path\]: /)
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
            const options = readOptions(["a.test.ts", "b.test.ts"])
            assert.equal(options.mode, "node")
            if (options.mode !== "node") return
            assert.deepEqual(options.session.files, [resolve("a.test.ts"), resolve("b.test.ts")])
            assert.deepEqual(options.imports.paths(), [])
        })

        it("refuses Node mode without a file, and a CommonJS suite in every mode", () => {
            assert.throws(() => readOptions([]))
            assert.throws(() => readOptions(["a.test.ts", "b.cjs", "c.cts"]), /CommonJS test files are not supported: b\.cjs, c\.cts$/)
            assert.throws(() => readOptions(["--playwright", "chromium", "b.cjs"]), /CommonJS test files are not supported: b\.cjs$/)
            assert.throws(() => readOptions(["--playwright", "chromium", "c.cts"]), /CommonJS test files are not supported: c\.cts$/)
        })

        it("takes TypeScript in the browser modes, for a suite and for a --script, and in Node mode", () => {
            assert.equal(readOptions(["--playwright", "chromium", "a.test.ts"]).mode, "playwright")
            assert.equal(readOptions(["--webdriver", "a.mts"]).mode, "webdriver")
            assert.equal(readOptions(["--serve", "--script", "setup.ts", "--script", "setup.cjs"]).mode, "serve")
            assert.equal(readOptions(["--serve", "--script", "setup.cjs"]).mode, "serve")
            assert.equal(readOptions(["a.test.ts", "b.mts"]).mode, "node")
        })

        it("reads --serve: no suite, nothing else set", () => {
            const options = readOptions(["--serve"])
            assert.equal(options.mode, "serve")
            assert.equal(options.session.files?.length, 0)
            assert.equal(options.imports.paths().length, 0)
        })

        it("reads --host as given, --port and --origin checked and normalized", () => {
            const options = readOptions(["--serve", "--host", "0.0.0.0", "--port", "3000", "--origin", "https://tal.example:443/"])
            assert.equal(options.mode, "serve")
            if (options.mode !== "serve") return
            assert.equal(options.host, "0.0.0.0")
            assert.equal(options.port, 3000)
            assert.equal(options.origin, "https://tal.example")
            assert.throws(() => readOptions(["--serve", "--port", "port"]), /--port takes/)
            assert.throws(() => readOptions(["--serve", "--origin", "tal.example"]), /--origin takes/)
        })

        it("reads --script and --alias, each resolved, in order", () => {
            const options = readOptions(["--serve", "--script", "a.js", "--alias", "mod=m.mjs", "--script", "b.js"])
            assert.equal(options.mode, "serve")
            if (options.mode !== "serve") return
            assert.deepEqual(options.scripts, [resolve("a.js"), resolve("b.js")])
            assert.deepEqual(options.imports.paths(), [resolve("m.mjs")])
            assert.equal(options.imports.entries().get("mod")?.getPath(), resolve("m.mjs"))
            assert.throws(() => readOptions(["--serve", "--alias", "mod"]), /--alias takes/)
        })

        it("reads --reporter as given, in every mode", () => {
            const named = (args: string[]): string | undefined => (readOptions(args) as {session: SessionConfig}).session.reporter
            assert.equal(named(["--reporter", "tap", "a.test.ts"]), "tap")
            assert.equal(named(["--reporter", "html", "--serve"]), "html")
            assert.equal(named(["a.test.ts"]), undefined)
        })

        it("reads --no-summary as summary false, and leaves it unset otherwise", () => {
            const summary = (args: string[]): boolean | undefined => (readOptions(args) as {session: SessionConfig}).session.summary
            assert.equal(summary(["--no-summary", "a.test.ts"]), false)
            assert.equal(summary(["--no-summary", "--serve"]), false)
            assert.equal(summary(["a.test.ts"]), undefined)
        })

        it("reads --alias in Node mode too", () => {
            const options = readOptions(["--alias", "node:crypto=sha256.mjs", "a.test.ts"])
            assert.equal(options.mode, "node")
            if (options.mode !== "node") return
            assert.equal(options.imports.entries().get("node:crypto")?.getPath(), resolve("sha256.mjs"))
            assert.throws(() => readOptions(["--alias", "cdn=https://cdn.example/x.js", "a.test.ts"]), /--alias: a URL applies to --playwright, --webdriver and --serve only: "cdn"/)
        })

        it("reads --playwright with its browser and config file", () => {
            const options = readOptions(["--playwright", "webkit", "--playwright-config", "config.json", "suite.mjs"])
            assert.equal(options.mode, "playwright")
            if (options.mode !== "playwright") return
            assert.equal(options.engine, "webkit")
            assert.equal(options.configJson, "config.json")
            assert.deepEqual(options.session.files, [resolve("suite.mjs")])
            assert.throws(() => readOptions(["--playwright", "electron", "suite.mjs"]), /--playwright takes/)
        })

        it("reads --webdriver with its session file and endpoint, the endpoint on loopback by default", () => {
            const options = readOptions(["--webdriver", "suite.mjs"])
            assert.equal(options.mode, "webdriver")
            if (options.mode !== "webdriver") return
            assert.equal(options.sessionReq, undefined)
            assert.equal(options.endpoint, undefined)
            const given = readOptions(["--webdriver", "--webdriver-session", "browser/session/chrome-attach.json", "--endpoint", "http://127.0.0.1:9515", "suite.mjs"])
            assert.equal(given.mode, "webdriver")
            if (given.mode !== "webdriver") return
            assert.equal(typeof given.sessionReq?.capabilities, "object")
            assert.equal(given.endpoint, "http://127.0.0.1:9515")
        })

        it("refuses two of --playwright, --webdriver and --serve", () => {
            assert.throws(() => readOptions(["--playwright", "chromium", "--serve"]), /are exclusive$/)
            assert.throws(() => readOptions(["--webdriver", "--serve"]), /are exclusive$/)
            assert.throws(() => readOptions(["--playwright", "chromium", "--webdriver", "suite.mjs"]), /are exclusive$/)
        })

        it("refuses the server's and the page's flags in Node mode", () => {
            for (const flags of [["--host", "x"], ["--port", "3000"], ["--origin", "http://x"], ["--script", "s.js"], ["--mount", "site"]]) {
                assert.throws(() => readOptions([...flags, "a.test.ts"]), /apply to --playwright, --webdriver and --serve only$/)
            }
        })

        it("refuses the WebDriver flags outside --webdriver", () => {
            assert.throws(() => readOptions(["--serve", "--webdriver-session", "s.json"]), /apply to --webdriver only$/)
            assert.throws(() => readOptions(["--playwright", "chromium", "--endpoint", "http://x", "suite.mjs"]), /apply to --webdriver only$/)
            assert.throws(() => readOptions(["--endpoint", "http://x", "a.test.ts"]), /apply to --webdriver only$/)
        })

        it("refuses the Playwright flags outside --playwright", () => {
            assert.throws(() => readOptions(["--serve", "--playwright-config", "s.json"]), /applies to --playwright only$/)
            assert.throws(() => readOptions(["--webdriver", "--playwright-config", "s.json"]), /applies to --playwright only$/)
        })

        it("refuses a runner with no suite on --playwright and --webdriver", () => {
            assert.throws(() => readOptions(["--playwright", "chromium", "--mount", "site"]), /no test files specified$/)
            assert.throws(() => readOptions(["--webdriver"]), /no test files specified$/)
            assert.doesNotThrow(() => readOptions(["--serve"]))
        })

        it("reads several suites in a browser mode from one directory, in order, and refuses them from two", () => {
            const options = readOptions(["--playwright", "chromium", "test/b.mjs", "./test/a.mjs", "test/b.mjs", "test/sub/c.mjs"])
            assert.equal(options.mode, "playwright")
            if (options.mode !== "playwright") return
            assert.deepEqual(options.session.files, [resolve("test/b.mjs"), resolve("test/a.mjs"), resolve("test/b.mjs"), resolve("test/sub/c.mjs")])
            assert.throws(() => readOptions(["--playwright", "chromium", "test/a.mjs", "other/b.mjs"]), /from one directory$/)
            assert.throws(() => readOptions(["--webdriver", "x/a.mjs", "test/b.mjs"]), /from one directory$/)
            assert.throws(() => readOptions(["--serve", "test/a/x.mjs", "test/b/y.mjs"]), /from one directory$/)
        })

        it("counts a suite's directory under a script's or an alias's as that one", () => {
            const options = readOptions(["--playwright", "chromium", "--alias", "lib=test/lib.mjs", "test/a/x.mjs", "test/b/y.mjs"])
            assert.equal(options.mode, "playwright")
            assert.equal(readOptions(["--playwright", "chromium", "--script", "test/setup.js", "test/a/x.mjs", "test/b/y.mjs"]).mode, "playwright")
        })

        it("reads --serve with --mount, without a suite", () => {
            const options = readOptions(["--serve", "--mount", "site"])
            assert.equal(options.mode, "serve")
            assert.deepEqual(options.session.files, [])
            assert.equal((options as {mount?: string}).mount, resolve("site"))
        })

        it("refuses a flag it does not know, and a flag missing its value", () => {
            assert.throws(() => readOptions(["--watch", "suite.mjs"]), /--watch/)
            assert.throws(() => readOptions(["--serve", "--port"]), /--port/)
        })
    })
})
