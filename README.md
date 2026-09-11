# test-assert-lite

## CLI

`test-assert` runs ES module test suites written against `node:test` and `node:assert` on this package.

```sh
test-assert test/*.mjs                                       # in this Node process
test-assert --serve browser/tests/bundled.mjs                # serves the suite and prints the URL to open
test-assert --webdriver browser/tests/bundled.mjs            # in the browser a WebDriver server drives, Safari say
test-assert --playwright chromium browser/tests/bundled.mjs  # in headless Chromium, through Playwright
```

- The files are named one by one; globs and directories are the shell's job. CommonJS suites (`.cjs`, `.cts`) are refused in every mode; in the browser modes TypeScript (`.ts`, `.mts`, `.cts`) is refused too, for a `--script` as well, since a browser strips no types.
- The browser modes, `--serve`, `--webdriver` and `--playwright`, take one suite, bundled with its imports; `--serve` with `--mount` may take none. They are exclusive.
- A run exits 0 when every test passed, 1 otherwise, with the report on stdout. Everything else, the server's access log included, goes to stderr.
- The report ends with two lines `node --test` never prints: this package's version, and the user agent the suites ran under, the browser's or `Node.js/24` say.

### -v, --version

- Prints this package's version and exits.

### --alias <specifier>=<file>

- ES module a specifier resolves to, `--alias lodash=node_modules/lodash-es/lodash.js` say. Repeatable, in every mode.
- A `node:` builtin can be named, `--alias node:crypto=sha256.mjs` say, so the same suite runs on the same module in Node and in a browser.
- In the browser modes a mistyped file shows up as a 404 in the access log on stderr.

### --import-map <file>

- A JSON import map, for the specifiers too many to give as `--alias`. Its `imports` come first, each `--alias` after, so the command line has the last word.
- A relative address, `./vendor/x.js` say, is resolved against the file and served as an `--alias` file is. An address starting with `/`, or a URL, goes into the page's map as it is, for the root to serve or a CDN; in Node mode such an address is refused unless a later entry takes the specifier over.
- `imports` only, keys as written: a URL can be a key too, to stand a local copy in for a CDN. `scopes`, `integrity`, prefix entries ending in `/` and relative keys are refused for now rather than mismatched.
- The file is read once; `--serve` watches the files it names, not the map itself.

### --serve

- Serves the suite for a browser, prints the URL to open, and keeps serving until Ctrl-C.
- The page reloads when the suite, a `--script` or an imported file changes.
- With `--mount`, the suite may be left out.

### --host <address>

- Address the server listens on. Default: `127.0.0.1`.
- For a browser on another machine: the address that machine reaches, `192.168.0.2` say, or `0.0.0.0` with `--origin`.

### --port <number>

- Port the server listens on. Default: a free one.
- A fixed port is for an SSH tunnel or a firewall rule that has to name it.

### --origin <url>

- What the browser reaches the server as, `http(s)://host[:port]`. Default: the address listened on, `127.0.0.1` for a wildcard such as `0.0.0.0`.
- For a tunnel or a proxy in between: it is what the runners open and what `--serve` prints.

### --script <file>

- Classic script to run before the suite, an IIFE build for a global it sets up, say. Repeatable, in order.
- A mistyped file shows up as a 404 in the access log on stderr.

### --mount <dir|url>

- What the root serves in place of `htdocs/`: a directory, or an origin to proxy, `http://127.0.0.1:5173` for an app's dev server say.
- Its HTML pages get the import map and the suite, when there is one, in their head, so a page the app makes runs the suite.

### --webdriver

- Runs the suite in the browser a WebDriver server drives, `safaridriver -p 4444` or `chromedriver --port=4444` say.
- Needs no package: the server does the launching, so Safari on a Mac runs the suite too, over an SSH tunnel if need be.

### --webdriver-session <file>

- JSON sent as the body of `POST /session`: the capabilities the driver takes. Default: none.
- `browser/session/` has a few to pass as they are or to copy and edit: `chrome-headless.json`, `firefox-headless.json`, `chrome-attach.json`.

### --endpoint <url>

- The WebDriver server. Default: `http://127.0.0.1:4444`.

### --playwright <browser>

- Runs the suite in a headless `chromium`, `firefox` or `webkit` through Playwright.
- Needs the `playwright` package and that browser: `npm install -D playwright && npx playwright install chromium`.

## Sample run

`sample/demo.mjs` is a small suite written against `node:test`: two suites under one, six tests, the last failing on purpose. It has no imports of its own, so the browser modes take it as it is, no bundling needed. `test-assert sample/demo.mjs` prints this, with a stack trace under the failure that is left out here; `node --test sample/demo.mjs` prints the same tree and the same counts.

```
▶ query string helpers
  ▶ parseQuery() on a search string
    ✔ reads a single pair (0.216ms)
    ✔ decodes percent-encoded values (0.062ms)
    ✔ returns an empty object for no query (0.021ms)
  ✔ parseQuery() on a search string (0.873ms)
  ▶ buildQuery() from an object
    ✔ round-trips through parseQuery() (0.041ms)
    ✔ appends to a URL (0.035ms)
    ✖ encodes a space as %20 (0.078ms)
  ✖ buildQuery() from an object (0.346ms)
✖ query string helpers (1.306ms)
ℹ tests 6
ℹ suites 3
ℹ pass 5
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1.8057529999999957

✖ failing tests:

✖ encodes a space as %20 (0.078ms)
  AssertionError: expected "q=black%20cat", got "q=black+cat"
```
