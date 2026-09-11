# test-assert-lite

## Command line

`test-assert` runs ES module test suites written against `node:test` and `node:assert` on this package.

```sh
test-assert test/*.mjs                                       # in this Node process
test-assert --serve browser/tests/bundled.mjs                # serves the suite and prints the URL to open
test-assert --playwright chromium browser/tests/bundled.mjs  # in headless Chromium, through Playwright
test-assert --webdriver browser/tests/bundled.mjs            # in the browser a WebDriver server drives, Safari say
```

The browser modes take one suite, bundled, and accept `--alias <specifier>=<file>` for an ES module a bare specifier should resolve to and `--script <file>` for a classic script to run first. `--host <address>` has the server listen on another address than 127.0.0.1, `0.0.0.0` say, for a browser on another machine, and `--port <number>` on a port of your choosing rather than a free one, as a tunnel to that machine may need: `ssh -R 3000:127.0.0.1:3000` there, then `--webdriver --port 3000` here. `--origin <url>` names what the browser reaches the server as, `http://tal.example:3000` say, when that is not the address listened on; it is what the runners open and what `--serve` prints. `--serve` also watches the suite, the scripts and the aliases, and the page reloads when one of them changes. `--playwright` takes `chromium`, `firefox` or `webkit`, and needs the `playwright` package and that browser (`npx playwright install chromium`); `--serve` needs neither. The server logs every request to stderr, one line each, so a mistyped `--script` or `--alias` shows up there as a 404. The two pages are `htdocs/index.html`, which `--serve` hands to a person, and `browser/run.html`, which both browser runners open under a URL of the run's own and which reports back to the CLI over HTTP; the CLI puts the import map, the classic scripts and the suites into the head of either.

`--webdriver` needs no package: it drives whatever browser a WebDriver server launches, `safaridriver -p 4444` or `chromedriver --port=4444` say. `--webdriver-session <file>` sends the JSON in that file as the body of `POST /session`, for the capabilities a driver takes; `--endpoint <url>` says where the server listens, `http://127.0.0.1:4444` by default. The package carries a few such files under `browser/session/`, to pass as they are or to copy and edit: `chrome-headless.json` and `firefox-headless.json` launch the browser without a window, and `chrome-attach.json` attaches chromedriver to a Chrome already running with `--remote-debugging-port=9222`. The first reads:

```json
{"capabilities": {"alwaysMatch": {"goog:chromeOptions": {"args": ["--headless=new"]}}}}
```

The browser fetches the suite from this machine, so a driver on another one, Safari on a Mac reached over an SSH tunnel say, takes `--host` with an address that machine can reach.

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
