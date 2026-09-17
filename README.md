# test-assert-lite

[![Node.js CI](https://github.com/kawanet/test-assert-lite/workflows/Node.js%20CI/badge.svg?branch=main)](https://github.com/kawanet/test-assert-lite/actions/)
[![npm version](https://img.shields.io/npm/v/test-assert-lite)](https://www.npmjs.com/package/test-assert-lite)
[![gzip size](https://img.badgesize.io/https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js?compression=gzip)](https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js)

Run your `node:test` and `node:assert` test files in browsers, as they are.

- The test file stays as written, imports included: the CLI maps `node:test` and `node:assert` to this package
- From `node:test`: `describe` / `it`, `test` with `t.test()` subtests, `before` / `after`, `skip` and `todo`
- From `node:assert`: `assert` and `strict`, with `ok`, `equal`, `deepStrictEqual`, `throws`, `rejects`, `match` and the rest
- One command per target: this Node.js process, headless Chromium, Firefox and WebKit, or Safari and others over WebDriver
- `--import-map` works in Node too, which has no import maps of its own: one map file for Node and browsers
- `--alias node:crypto=sha256-uint8array` puts your own implementation under a builtin's name, so one suite tests both
- Under 30KB script, under 10KB gzipped, no dependencies

## SYNOPSIS

BDD style with `describe` and `it`:

```js
import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

const parseQuery = (search) => Object.fromEntries(new URLSearchParams(search))
const buildQuery = (params) => new URLSearchParams(params).toString()

describe("buildQuery() from an object", () => {
    it("round-trips through parseQuery()", () => {
        const params = {q: "cat", page: "2"}
        assert.deepEqual(parseQuery("?" + buildQuery(params)), params)
    })
    it("appends to a URL", () => {
        const url = new URL("https://example.com/search")
        url.search = buildQuery({q: "cat"})
        assert.equal(url.href, "https://example.com/search?q=cat")
    })
    it("encodes a space as %20", () => {
        assert.equal(buildQuery({q: "black cat"}), "q=black%20cat")
    })
})
```

The same file runs with `node --test` or `test-assert`:

```sh
node --test test/query.test.mjs

test-assert test/query.test.mjs

test-assert --webdriver test/query.test.mjs

test-assert --playwright chromium test/query.test.mjs
```

The `spec` result from `test-assert`, version and user-agent lines omitted:

```
▶ buildQuery() from an object
  ✔ round-trips through parseQuery() (0.274ms)
  ✔ appends to a URL (0.047ms)
  ✖ encodes a space as %20 (0.093ms)
✖ buildQuery() from an object (1.285ms)
ℹ tests 3
ℹ suites 1
ℹ pass 2
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2.867

✖ failing tests:

✖ encodes a space as %20 (0.093ms)
  AssertionError: expected "q=black%20cat", got "q=black+cat"
```

`test` with subtests:

```js
import {strict as assert} from "node:assert"
import {test} from "node:test"

test("URLSearchParams", async (t) => {
    const params = new URLSearchParams("a=1&b=2")
    await t.test("reads a key", () => {
        assert.equal(params.get("a"), "1")
    })
    await t.test("is null for a missing key", () => {
        assert.equal(params.get("c"), null)
    })
})
```

See [test-assert-lite.d.ts](https://github.com/kawanet/test-assert-lite/blob/main/types/test-assert-lite.d.ts) for the supported API.

## CLI

`test-assert` runs suites that use the supported `node:test` and `node:assert` APIs. The test files and their import lines stay unchanged.

```sh
# Run suites in the local Node.js with the library instead of node:test
test-assert test/*.test.mjs

# Serve suites at http://127.0.0.1:3000/ for your browser
test-assert --serve --port 3000 test/browser.test.mjs

# Run suites in Safari, Chrome, or another WebDriver browser for CI
test-assert --webdriver test/browser.test.mjs

# Run suites in headless Chromium through Playwright for CI
test-assert --playwright chromium test/browser.test.mjs
```

- Name files directly; the shell expands globs. CommonJS test files are not supported.
- TypeScript test files run as they are, in a browser too: the server strips the types with Node.js's own `stripTypeScriptTypes`, so the Node.js running the CLI has to run `.ts` files itself (22.18 and later).
- `--webdriver` runs the test files in the browser a WebDriver server drives, from one directory.
- `--playwright <browser>` does the same through Playwright.
- `--serve` serves for a browser, with auto reload. The three are exclusive.
- A run exits 0 when all tests pass and 1 otherwise. Reports go to stdout; server messages and access logs go to stderr.
- Each report ends with the counts, the package version and the user agent that ran the suite, unless `--no-summary`.

### `-v`, `--version`

- Prints this package's version and exits.

### `--alias <specifier>=<file>`

- `node:test` and `node:assert` are aliased to this package already: a test file written for Node needs no entry, and no change.
- ES module a specifier resolves to, `--alias lodash=node_modules/lodash-es/lodash.js` say. Repeatable, in every mode.
- A `node:` builtin can be named, `--alias node:crypto=sha256.mjs` say, so the same suite runs on the same module in Node and in a browser.
- The alias reaches every import of that name, a dependency's too, as an import map does.
- The target may also be a URL for the page, `--alias cdn=https://cdn.example/x.js` say, in the browser modes; or one of this package's own names, `--alias my-test=test-assert-lite/test` say, in every mode.

### `--import-map <file>`

- A JSON import map, for the specifiers too many to give as `--alias`. Its `imports` come first, each `--alias` after, so the command line has the last word.
- Relative paths start from the map file. See Import Maps below for an example.

### `--reporter <name>`

- How the run is reported: `spec` (default), `tap` or `html`.
- Or a module to import, `--reporter test-assert-lite/reporter/tap` say: its default export is the reporter, as `node --test-reporter` takes one. A name that does not import is one failed test, and the run reports with `spec`.

### `--no-summary`

- Leaves the counts, the package version and the user agent off the report. A script that declares no test then reports nothing.

### `--serve`

- With test files, serves the run page; without them, serves `htdocs/`, or what `--mount` names. Prints the URL to open and keeps serving until Ctrl-C.
- Without test files, `htdocs/index.html` imports `index.js`, so `--alias index.js=test/browser.test.mjs` runs that suite in it.
- Auto reloads when a test file, a `--script` file or a locally mapped file changes.

### `--host <address>`

- Address the server listens on. Default: `127.0.0.1`.
- For a browser on another machine, listen on an address that machine can reach: `--host 192.168.0.2`.
- `--host 0.0.0.0` listens on every address. Add `--origin` then, so the printed URL and the runners use one the browser can reach.

### `--port <number>`

- Port the server listens on. Default: a free one.
- `--port 3000` fixes it, for an SSH tunnel or a firewall rule that has to name the port.

### `--origin <url>`

- The URL the browser opens, `http(s)://host[:port]`. Default: the address the server listens on.
- With `--host 0.0.0.0` the default is `http://127.0.0.1:<port>`, which only this machine can open. Give the reachable one: `--origin http://192.168.0.2:3000`.
- Through an SSH tunnel or a proxy, the browser opens a different URL than this server listens on. Pass that URL as `--origin`: the runners open it, and `--serve` prints it.

### `--script <file>`

- Classic script to run before the suite, an IIFE build for a global it sets up, say. Repeatable, in order.
- A mistyped file shows up as a 404 in the access log on stderr.

### `--mount <dir|url>`

- What the root serves in place of `htdocs/`: a directory, or an origin to proxy, `http://127.0.0.1:8080` say, so the suite runs in a page of the app under test.
- Its HTML pages get the import map and the scripts in their head, so a page the app makes imports the library, and a suite, by name.
- A page with its own `<script type="importmap">` is served as it is: no import map, no script or suite tags. stderr says so.

### `--webdriver`

- Runs the suite in the browser a [WebDriver](https://w3c.github.io/webdriver/) server drives, `safaridriver -p 4444` or `chromedriver --port=4444` say.
- No extra dependency: the WebDriver server launches the browser, so Safari on a Mac runs the suite too, over an SSH tunnel if need be.

### `--webdriver-session <file>`

- JSON sent as the body of `POST /session`: the capabilities the driver takes. Default: `{"capabilities": {}}`.
- `browser/session/` has a few to pass as they are or to copy and edit: `chrome-headless.json`, `firefox-headless.json`, `chrome-attach.json`.

### `--endpoint <url>`

- The WebDriver server. Default: `http://127.0.0.1:4444`.

### `--playwright <browser>`

- Runs the suite in a headless `chromium`, `firefox` or `webkit` through [Playwright](https://playwright.dev/).
- Needs the `playwright` package and that browser: `npm install -D playwright && npx playwright install chromium`.

### Import Maps

Map package names to browser-ready ESM files installed by npm:

```json
{
    "imports": {
        "sha256-uint8array": "../node_modules/sha256-uint8array/dist/sha256-uint8array.mjs",
        "int64-buffer": "../node_modules/int64-buffer/int64-buffer.mjs"
    }
}
```

Relative paths start from the import map file, not the current directory.

For `test/import-map.json` above:

```sh
# Run with the import map in Node.js
test-assert --import-map test/import-map.json test/browser.test.mjs

# Run with the same import map in Chromium
test-assert --playwright chromium --import-map test/import-map.json test/browser.test.mjs
```

- `node:test`, `node:assert` and `test-assert-lite` are mapped by default. No entry needed for them.
- The same map works in Node mode and in the browser modes.
- A URL can be a key: `"https://cdn.example/x.js": "./vendor/x.js"` stands a local copy in for the CDN file.

### Standing in for a builtin

A library that replaces a Node.js builtin can run one suite against both:

```sh
# Run the suite on Node's own crypto
test-assert test/sha256.test.mjs

# Run the same suite on your implementation, in Node.js and in Chromium
test-assert --alias node:crypto=dist/sha256-uint8array.mjs test/sha256.test.mjs
test-assert --playwright chromium --alias node:crypto=dist/sha256-uint8array.mjs test/sha256.test.mjs
```

- The suite is written for the builtin: `import {createHash} from "node:crypto"`, and no line names the library.
- `--alias` puts [sha256-uint8array](https://github.com/kawanet/sha256-uint8array) under that name, so the same suite runs on it, in Node.js and in a browser.
- Any package can stand in this way, so the same suite compares implementations too.

### Bundling with Rollup

The two builtins stay in the bundle as written. The CLI maps them, in Node and in a browser. Good for CI.

```js
// rollup.config.mjs
import multiEntry from "@rollup/plugin-multi-entry"

export default {
    input: "test/*.test.mjs",
    external: [
        "node:assert",
        "node:test",
    ],
    output: {
        file: "htdocs/scripts/bundled-tests.mjs",
        format: "esm",
    },
    plugins: [multiEntry()],
    treeshake: false,
}
```

```sh
# Run the bundle in Node.js
test-assert htdocs/scripts/bundled-tests.mjs

# Run the same bundle in Chromium
test-assert --playwright chromium htdocs/scripts/bundled-tests.mjs
```

### Safari over WebDriver

```sh
# Enable Safari automation once
safaridriver --enable

# Start the WebDriver server
safaridriver -p 4444 &

# Run the same bundle in Safari
test-assert --webdriver htdocs/scripts/bundled-tests.mjs
```

## BROWSER MODULE

Or skip the build: tests can go straight into a page.

The minified build is an ES module: an import map leads the package's name to it on a CDN.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/test-assert-lite/htdocs/styles/test-assert-lite.css">
<script type="importmap">
{
    "imports": {
        "test-assert-lite": "https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js",
        "test-assert-lite/test": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/test.js",
        "test-assert-lite/assert": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/assert.js",
        "test-assert-lite/session": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/session.js"
    }
}
</script>
<div id="output"></div>
<script type="module">
    import {describe, it} from "test-assert-lite/test"
    import {strict as assert} from "test-assert-lite/assert"
    import {session, end} from "test-assert-lite/session"

    // The report goes to console.log by default; render it as HTML in the page instead.
    // session() comes before the first test is declared.
    session({
        reporter: "html",
        output: html => document.getElementById("output").insertAdjacentHTML("beforeend", html),
    })

    describe("URL", () => {
        it("keeps the host", () => {
            assert.equal(new URL("https://example.com/a?b").host, "example.com")
        })
    })

    // end() runs every test registered so far and resolves once they are reported
    end().then(result => console.log(result.success ? "PASS" : "FAIL"))
</script>
```

### Bundled tests in a page

Bundle the suites as one ES module with `node:test` and `node:assert` left external, and let an import map lead them, and the package's name the bridges import, to the CDN.

```js
// rollup.config.mjs
export default {
    input: "test/*.test.mjs",
    external: [
        "node:assert",
        "node:test",
    ],
    output: {
        file: "htdocs/scripts/bundled-tests.js",
        format: "es",
    },
    treeshake: false,
}
```

```html
<script type="importmap">
{
    "imports": {
        "test-assert-lite": "https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js",
        "node:test": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/test.js",
        "node:assert": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/assert.js",
        "node:assert/strict": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/assert/strict.js",
        "test-assert-lite/session": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/session.js"
    }
}
</script>
<script type="module" src="./scripts/bundled-tests.js"></script>
<script type="module">
    import {end} from "test-assert-lite/session"
    end()
</script>
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://github.com/kawanet/test-assert-lite
- https://nodejs.org/api/test.html
- https://nodejs.org/api/assert.html
