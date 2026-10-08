# test-assert-cli

[![npm version](https://img.shields.io/npm/v/test-assert-cli)](https://www.npmjs.com/package/test-assert-cli)

Serve your `node:test` files to the browser, or run them in Node.js, on test-assert-lite.

- The test file stays as written, imports included: `tacli` maps `node:test` and `node:assert` to [test-assert-lite](https://www.npmjs.com/package/test-assert-lite)
- One command per target, built on it: `tacli` for this Node.js process, [chromium-js, firefox-js and webkit-js](https://www.npmjs.com/package/playwright-js-cli) for the headless browsers, [webdriver-js](https://www.npmjs.com/package/webdriver-js-cli) for Safari and others over WebDriver
- `--import-map` works in Node too, which has no import maps of its own: one map file for Node and browsers
- `--alias node:crypto=sha256-uint8array` puts your own implementation under a builtin's name, so one suite tests both

```sh
npm install -D test-assert-cli
```

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

The same file runs with `node --test` and with `tacli` alike:

```sh
node --test test/query.test.mjs

tacli --test test/query.test.mjs
```

The `spec` result from `tacli`, version and user-agent lines omitted:

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

## CLI

`tacli` runs suites that use the supported `node:test` and `node:assert` APIs. The test files and their import lines stay unchanged.

```sh
# Run suites in the local Node.js with the library instead of node:test
tacli --test test/*.test.mjs

# Serve suites at http://127.0.0.1:3000/ for your browser
tacli --serve --port 3000 test/browser.test.mjs
```

- The first file is the test file, and what follows it is the script's argv, as `node file args` has it. `--test` takes every argument as a test file. Name files directly; the shell expands globs. CommonJS test files are not supported. `-e <script>` runs a script in their place.
- A script may `import {argv, stdout, stderr} from "test-assert-lite/process"`, in a browser as under Node. The streams reach the CLI's own, and `argv` holds the arguments as given. A file that imports them from `node:process` runs in a browser with `--alias node:process=test-assert-lite/process`.
- TypeScript test files run as they are, in a browser too, through `stripTypeScriptTypes` of Node.js 22.18 or later.
- `--serve` serves the page for a browser, with auto reload. The browser runs are commands of their own, built on `tacli` and taking its options: [webdriver-js](https://www.npmjs.com/package/webdriver-js-cli), and [chromium-js, firefox-js and webkit-js](https://www.npmjs.com/package/playwright-js-cli).
- A run exits 0 when all tests pass and 1 otherwise. Reports go to stdout; server messages and access logs go to stderr.
- Reports include a summary unless `-q`.

### `-v`, `--version`

- Prints the version of test-assert-cli and exits.

### `-e`, `--eval <script>`

- Runs the script in place of test files: `tacli -e "console.log(process.version)"`.
- The script is a module: it imports `node:test` as a test file does, and a script that throws is one failed test.
- The arguments after it are the script's, from `argv[1]`, as `node -e` gives them.

### `--test`

- Takes every argument as a test file, as `node --test` reads them: `tacli --test test/*.test.mjs`.
- A run with no tests is reported too, as `node --test` reports one. Without `--test` such a run says nothing, as a script under `node` does.
- Without it, the first file is the test file and the rest is its argv. A flag meant for the script goes after `--`: `tacli test/cli.test.mjs -- --verbose`.

### `--alias <specifier>=<file>`

- `node:test` and `node:assert` are aliased to test-assert-lite already: a test file written for Node needs no entry, and no change.
- ES module a specifier resolves to, `--alias lodash=node_modules/lodash-es/lodash.js` say. Repeatable, in every mode.
- A `node:` builtin can be named, `--alias node:crypto=sha256.mjs` say, so the same suite runs on the same module in Node and in a browser.
- The alias reaches every import of that name, a dependency's too, as an import map does.
- The target may also be a URL for the page, `--alias cdn=https://cdn.example/x.js` say, in the browser modes; or a test-assert-lite subpath, `--alias my-test=test-assert-lite/test` say, in every mode.

### `--import-map <file>`

- A JSON import map, for the specifiers too many to give as `--alias`. Its `imports` come first, each `--alias` after, so the command line has the last word.
- Relative paths start from the map file. See Import Maps below for an example.

### `--reporter <name>`

- How the run is reported: `spec` (default), `tap` or `html`.
- Or a module to import, `--reporter test-assert-lite/reporter/tap` say: its default export is the reporter, as `node --test-reporter` takes one. A name that does not import is one failed test, and the run reports with `spec`.

### `-q`, `--quiet`

- Reduces output while keeping failures visible.
- A named `--reporter` keeps its usual format.

### `--serve`

- With test files, serves the run page; without them, serves `htdocs/`, or what `--mount` names. Prints the URL to open and keeps serving until Ctrl-C.
- Without test files, `htdocs/index.html` imports `index.js`, so `--alias index.js=test/browser.test.mjs` runs that suite in it.
- Auto reloads when a test file, a `--script` file or a locally mapped file changes.

### `--port <[host:]port>`

- Port the server listens on, and the address ahead of it. Default: `127.0.0.1:0`, a free port.
- `--port 3000` fixes the port, for an SSH tunnel or a firewall rule that has to name it.
- For a browser on another machine, listen on an address that machine can reach: `--port 192.168.0.2:3000`.
- `--port 0.0.0.0:3000` listens on every address. Add `--origin` then, so the printed URL and the runners use one the browser can reach. An IPv6 literal goes in brackets: `--port [::]:3000`.

### `--origin <url>`

- The URL the browser opens, `http(s)://host[:port]`. Default: the address the server listens on.
- With `--port 0.0.0.0:3000` the default is `http://127.0.0.1:3000`, which only this machine can open. Give the reachable one: `--origin http://192.168.0.2:3000`.
- Through an SSH tunnel or a proxy, the browser opens a different URL than this server listens on. Pass that URL as `--origin`: the runners open it, and `--serve` prints it.

### `--script <file>`

- Classic script to run before the suite, an IIFE build for a global it sets up, say. Repeatable, in order.
- A mistyped file shows up as a 404 in the access log on stderr.

### `--mount <dir|url>`

- What the root serves in place of `htdocs/`: a directory, or an origin to proxy, `http://127.0.0.1:8080` say, so the suite runs in a page of the app under test.
- Its HTML pages get the import map and the scripts in their head, so a page the app makes imports the library, and a suite, by name.
- A page with its own `<script type="importmap">` is served as it is: no import map, no script or suite tags. stderr says so.

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
tacli --import-map test/import-map.json test/browser.test.mjs
```

- `node:test`, `node:assert` and `test-assert-lite` are mapped by default. No entry needed for them.
- The same map works in Node mode and in the browser modes.
- A URL can be a key: `"https://cdn.example/x.js": "./vendor/x.js"` stands a local copy in for the CDN file.

### Standing in for a builtin

A library that replaces a Node.js builtin can run one suite against both:

```sh
# Run the suite on Node's own crypto
tacli test/sha256.test.mjs

# Run the same suite on your implementation
tacli --alias node:crypto=dist/sha256-uint8array.mjs test/sha256.test.mjs
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
tacli --test htdocs/scripts/bundled-tests.mjs
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
