import {strict as assert} from "node:assert"
import {resolve} from "node:path"
import {describe, it} from "node:test"
import type {BrowserType} from "playwright-core"
import type {SessionConfig} from "./mode-options.ts"
import {mountOf, originOf, portOf, readOptions, usageOf} from "./options.ts"

const TITLE = "extras/options.test.ts"

// What an executable fixed on Playwright hands over. The options pass it on
// without a call, so a stub stands in for the engine.
const engine = {launch: async () => ({})} as unknown as BrowserType

describe(TITLE, () => {
    describe("portOf", () => {
        it("takes a whole number a socket can have", () => {
            assert.deepEqual(portOf("0"), {port: 0})
            assert.deepEqual(portOf("3000"), {port: 3000})
            assert.deepEqual(portOf("65535"), {port: 65535})
        })

        it("takes an address ahead of the port, an IPv6 literal in brackets, and an empty one as none", () => {
            assert.deepEqual(portOf("0.0.0.0:3000"), {host: "0.0.0.0", port: 3000})
            assert.deepEqual(portOf("127.0.0.1:0"), {host: "127.0.0.1", port: 0})
            assert.deepEqual(portOf("tal.example:8080"), {host: "tal.example", port: 8080})
            assert.deepEqual(portOf("[::1]:3000"), {host: "::1", port: 3000})
            assert.deepEqual(portOf("[::]:0"), {host: "::", port: 0})
            assert.deepEqual(portOf(":3000"), {port: 3000})
        })

        it("refuses what is no port, with the value in the reason", () => {
            for (const value of ["65536", "-1", "3000.5", "port", "0x50", "1e3", "", " 3000 ", "0.0.0.0:", "0.0.0.0:port", "[::1]3000", "::1:3000", "a:b:3000"]) {
                assert.throws(() => portOf(value), /--port takes \[host:\]port, the port from 0 to 65535: /)
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
            assert.deepEqual(readOptions(["--help", "--serve", "--mount", "site"]), {mode: "help"})
        })

        it("reads --version and -v, after --help", () => {
            assert.deepEqual(readOptions(["--version"]), {mode: "version"})
            assert.deepEqual(readOptions(["-v", "--serve", "suite.mjs"]), {mode: "version"})
            assert.deepEqual(readOptions(["-v", "-h"]), {mode: "help"})
        })

        it("reads Node mode as the default, the files resolved in order under --test", () => {
            const options = readOptions(["--test", "a.test.ts", "b.test.ts"])
            assert.equal(options.mode, "node")
            if (options.mode !== "node") return
            assert.deepEqual(options.files, [resolve("a.test.ts"), resolve("b.test.ts")])
            assert.deepEqual(options.connect?.argv, ["a.test.ts", "b.test.ts"])
            assert.deepEqual(options.imports.paths(), [])
        })

        it("reads the first argument as the test file without --test, and the rest as the script's argv", () => {
            const options = readOptions(["-q", "a.test.ts", "b.test.ts", "x"])
            assert.equal(options.mode, "node")
            if (options.mode !== "node") return
            assert.deepEqual(options.files, [resolve("a.test.ts")])
            assert.deepEqual(options.connect?.argv, ["a.test.ts", "b.test.ts", "x"])
            assert.equal(options.session?.quiet, 10)
        })

        it("leaves what follows -- to the script, and gives a script its arguments, a page too", () => {
            const dashed = readOptions(["a.test.ts", "--", "--quiet"])
            if (dashed.mode !== "node") return assert.fail(dashed.mode)
            assert.deepEqual(dashed.connect?.argv, ["a.test.ts", "--quiet"])
            assert.equal(dashed.session?.quiet, 0)
            const script = readOptions(["-e", "console.log(1)", "x", "y"])
            if (script.mode !== "node") return assert.fail(script.mode)
            assert.deepEqual(script.connect?.argv, ["x", "y"])
            assert.deepEqual(script.files, [])
            const served = readOptions(["--serve", "a.test.ts", "x"])
            if (served.mode !== "serve") return assert.fail(served.mode)
            assert.deepEqual(served.connect?.argv, ["a.test.ts", "x"])
            const empty = readOptions(["--serve"])
            if (empty.mode !== "serve") return assert.fail(empty.mode)
            assert.deepEqual(empty.connect?.argv, [])
        })

        it("refuses Node mode without a file, and a CommonJS suite in every mode", () => {
            assert.throws(() => readOptions([]))
            assert.throws(() => readOptions(["--test", "a.test.ts", "b.cjs", "c.cts"]), /CommonJS test files are not supported: b\.cjs, c\.cts$/)
            assert.throws(() => readOptions(["b.cjs"], {playwright: engine}), /CommonJS test files are not supported: b\.cjs$/)
            assert.throws(() => readOptions(["c.cts"], {webdriver: true}), /CommonJS test files are not supported: c\.cts$/)
        })

        it("takes TypeScript in the browser modes, for a suite and for a --script, and in Node mode", () => {
            assert.equal(readOptions(["a.test.ts"], {playwright: engine}).mode, "playwright")
            assert.equal(readOptions(["a.mts"], {webdriver: true}).mode, "webdriver")
            assert.equal(readOptions(["--serve", "--script", "setup.ts", "--script", "setup.cjs"]).mode, "serve")
            assert.equal(readOptions(["--serve", "--script", "setup.cjs"]).mode, "serve")
            assert.equal(readOptions(["a.test.ts", "b.mts"]).mode, "node")
        })

        it("reads -e and --eval as the script to run, in place of the test files", () => {
            const node = readOptions(["-e", "console.log(1)"])
            assert.equal(node.mode, "node")
            if (node.mode !== "node") return
            assert.equal(node.eval, "console.log(1)")
            assert.deepEqual(node.files, [])
            assert.equal(readOptions(["--eval", "console.log(1)"], {playwright: engine}).mode, "playwright")
            assert.equal(readOptions(["--serve", "-e", "console.log(1)"]).mode, "serve")
            const files = readOptions(["a.test.ts"])
            assert.equal(files.mode === "node" && files.eval, undefined)
            assert.throws(() => readOptions(["--test", "-e", "console.log(1)", "a.test.ts"]), /-e takes the place of the test files$/)
            assert.throws(() => readOptions(["-e"]), /argument missing/)
        })

        it("reads --serve: no suite, nothing else set", () => {
            const options = readOptions(["--serve"])
            assert.equal(options.mode, "serve")
            assert.equal(options.files?.length, 0)
            assert.equal(options.imports.paths().length, 0)
        })

        it("reads --port as the address and port to listen on, and --origin checked and normalized", () => {
            const options = readOptions(["--serve", "--port", "0.0.0.0:3000", "--origin", "https://tal.example:443/"])
            assert.equal(options.mode, "serve")
            if (options.mode !== "serve") return
            assert.equal(options.host, "0.0.0.0")
            assert.equal(options.port, 3000)
            assert.equal(options.origin, "https://tal.example")
            const bare = readOptions(["--serve", "--port", "3000"])
            assert.equal(bare.mode === "serve" ? bare.host : "", undefined)
            assert.equal(bare.mode === "serve" ? bare.port : -1, 3000)
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

        it("reads -q and --quiet as ten, --test as one less, and nothing as zero", () => {
            const quiet = (args: string[]): number | undefined => (readOptions(args) as {session: SessionConfig}).session.quiet
            assert.equal(quiet(["-q", "a.test.ts"]), 10)
            assert.equal(quiet(["--quiet", "--serve"]), 10)
            assert.equal(quiet(["a.test.ts"]), 0)
            assert.equal(quiet(["--test", "a.test.ts"]), -1)
            assert.equal(quiet(["--test", "-q", "a.test.ts"]), 9)
        })

        it("reads --alias in Node mode too", () => {
            const options = readOptions(["--alias", "node:crypto=sha256.mjs", "a.test.ts"])
            assert.equal(options.mode, "node")
            if (options.mode !== "node") return
            assert.equal(options.imports.entries().get("node:crypto")?.getPath(), resolve("sha256.mjs"))
            assert.throws(() => readOptions(["--alias", "cdn=https://cdn.example/x.js", "a.test.ts"]), /--alias: a URL applies to the browser modes only: "cdn"/)
        })

        it("reads the Playwright config file for the engine the executable fixed", () => {
            const options = readOptions(["--playwright-config", "packages/playwright-js-cli/playwright-config/iphone15pro.json", "suite.mjs"], {playwright: engine})
            assert.equal(options.mode, "playwright")
            if (options.mode !== "playwright") return
            assert.equal(options.browserType, engine)
            assert.equal(options.custom?.newPage?.isMobile, true)
            assert.deepEqual(options.files, [resolve("suite.mjs")])
        })

        it("reads the WebDriver config file and endpoint for an executable fixed on WebDriver", () => {
            const options = readOptions(["suite.mjs"], {webdriver: true})
            assert.equal(options.mode, "webdriver")
            if (options.mode !== "webdriver") return
            assert.equal(options.custom, undefined)
            assert.equal(options.endpoint, undefined)
            const given = readOptions(["--webdriver-config", "packages/webdriver-js-cli/webdriver-config/chrome-attach.json", "--endpoint", "http://127.0.0.1:9515", "suite.mjs"], {webdriver: true})
            assert.equal(given.mode, "webdriver")
            if (given.mode !== "webdriver") return
            assert.equal(typeof given.custom?.capabilities, "object")
            assert.equal(given.endpoint, "http://127.0.0.1:9515")
        })

        it("refuses two modes fixed at once, and --serve under either", () => {
            assert.throws(() => readOptions(["suite.mjs"], {webdriver: true, playwright: engine}), /are exclusive$/)
            assert.throws(() => readOptions(["--serve", "suite.mjs"], {webdriver: true}), /--serve/)
            assert.throws(() => readOptions(["--serve", "suite.mjs"], {playwright: engine}), /--serve/)
        })

        it("refuses the server's and the page's flags in Node mode", () => {
            for (const flags of [["--port", "3000"], ["--port", "0.0.0.0:3000"], ["--origin", "http://x"], ["--script", "s.js"], ["--mount", "site"]]) {
                assert.throws(() => readOptions([...flags, "a.test.ts"]), /apply to --serve only$/)
            }
        })

        it("refuses the WebDriver flags unless the executable fixed WebDriver", () => {
            assert.throws(() => readOptions(["--serve", "--webdriver-config", "s.json"]), /--webdriver-config/)
            assert.throws(() => readOptions(["--endpoint", "http://x", "suite.mjs"], {playwright: engine}), /--endpoint/)
            assert.throws(() => readOptions(["--endpoint", "http://x", "a.test.ts"]), /--endpoint/)
        })

        it("refuses the Playwright flag unless the executable fixed an engine", () => {
            assert.throws(() => readOptions(["--serve", "--playwright-config", "s.json"]), /--playwright-config/)
            assert.throws(() => readOptions(["--playwright-config", "s.json", "suite.mjs"], {webdriver: true}), /--playwright-config/)
        })

        it("refuses a runner with no suite under a fixed mode", () => {
            assert.throws(() => readOptions(["--mount", "site"], {playwright: engine}), /no test files specified$/)
            assert.throws(() => readOptions([], {webdriver: true}), /no test files specified$/)
            assert.doesNotThrow(() => readOptions(["--serve"]))
        })

        it("reads several suites in a browser mode from one directory, in order, and refuses them from two", () => {
            const options = readOptions(["--test", "test/b.mjs", "./test/a.mjs", "test/b.mjs", "test/sub/c.mjs"], {playwright: engine})
            assert.equal(options.mode, "playwright")
            if (options.mode !== "playwright") return
            assert.deepEqual(options.files, [resolve("test/b.mjs"), resolve("test/a.mjs"), resolve("test/b.mjs"), resolve("test/sub/c.mjs")])
            assert.throws(() => readOptions(["--test", "test/a.mjs", "other/b.mjs"], {playwright: engine}), /from one directory$/)
            assert.throws(() => readOptions(["--test", "x/a.mjs", "test/b.mjs"], {webdriver: true}), /from one directory$/)
            assert.throws(() => readOptions(["--test", "--serve", "test/a/x.mjs", "test/b/y.mjs"]), /from one directory$/)
        })

        it("counts a suite's directory under a script's or an alias's as that one", () => {
            const options = readOptions(["--test", "--alias", "lib=test/lib.mjs", "test/a/x.mjs", "test/b/y.mjs"], {playwright: engine})
            assert.equal(options.mode, "playwright")
            assert.equal(readOptions(["--test", "--script", "test/setup.js", "test/a/x.mjs", "test/b/y.mjs"], {playwright: engine}).mode, "playwright")
        })

        it("reads --serve with --mount, without a suite", () => {
            const options = readOptions(["--serve", "--mount", "site"])
            assert.equal(options.mode, "serve")
            assert.deepEqual(options.files, [])
            assert.equal((options as {mount?: string}).mount, resolve("site"))
        })

        it("refuses a flag it does not know, and a flag missing its value", () => {
            assert.throws(() => readOptions(["--watch", "suite.mjs"]), /--watch/)
            assert.throws(() => readOptions(["--serve", "--port"]), /--port/)
        })

        it("takes the mode the executable fixed, with that mode's flags, and refuses --serve", () => {
            const launching = readOptions(["--playwright-config", "packages/playwright-js-cli/playwright-config/iphone15pro.json", "suite.mjs"], {playwright: engine})
            assert.equal(launching.mode, "playwright")
            if (launching.mode !== "playwright") return
            assert.equal(launching.browserType, engine)
            assert.equal(launching.custom?.newPage?.isMobile, true)
            const driven = readOptions(["--endpoint", "http://127.0.0.1:9515", "suite.mjs"], {webdriver: true})
            assert.equal(driven.mode, "webdriver")
            if (driven.mode !== "webdriver") return
            assert.equal(driven.endpoint, "http://127.0.0.1:9515")
            assert.throws(() => readOptions(["--serve", "suite.mjs"], {webdriver: true}), /--serve/)
            assert.throws(() => readOptions(["--serve", "suite.mjs"], {playwright: engine}), /--serve/)
        })

        it("shows the usage for the command, with its own browser mode's flags alone", () => {
            assert.ok(usageOf("tacli").startsWith("Usage: tacli "))
            assert.ok(usageOf("tacli").includes("--serve"))
            assert.ok(!usageOf("tacli").includes("--endpoint"))
            assert.ok(!usageOf("tacli").includes("--playwright-config"))
            assert.ok(usageOf("chromium-js", {playwright: engine}).startsWith("Usage: chromium-js "))
            assert.ok(usageOf("chromium-js", {playwright: engine}).includes("--playwright-config"))
            assert.ok(!usageOf("chromium-js", {playwright: engine}).includes("--webdriver"))
            assert.ok(!usageOf("chromium-js", {playwright: engine}).includes("--serve"))
            assert.ok(usageOf("webdriver-js", {webdriver: true}).includes("--endpoint"))
            assert.ok(!usageOf("webdriver-js", {webdriver: true}).includes("--playwright"))
        })
    })
})
