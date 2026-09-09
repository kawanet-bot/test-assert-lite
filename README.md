# test-assert-lite

## Command line

`test-assert` runs ES module test suites written against `node:test` and `node:assert` on this package.

```sh
test-assert test/*.mjs                                       # in this Node process
test-assert --serve browser/tests/bundled.mjs                # serves the suite and prints the URL to open
test-assert --playwright chromium browser/tests/bundled.mjs  # in headless Chromium, through Playwright
test-assert --webdriver browser/tests/bundled.mjs            # in the browser a WebDriver server drives, Safari say
```

The browser modes take one suite, bundled, and accept `--alias <specifier>=<file>` for an ES module a bare specifier should resolve to and `--script <file>` for a classic script to run first. `--host <address>` serves the suite on another address than 127.0.0.1, for a browser on another machine. `--playwright` takes `chromium`, `firefox` or `webkit`, and needs the `playwright` package and that browser (`npx playwright install chromium`); `--serve` needs neither. The server logs every request to stderr, one line each, so a mistyped `--script` or `--alias` shows up there as a 404.

`--webdriver` needs no package: it drives whatever browser a WebDriver server launches, `safaridriver -p 4444` or `chromedriver --port=4444` say. `--webdriver-session <file>` sends the JSON in that file as the body of `POST /session`, for the capabilities a driver takes; `--endpoint <url>` says where the server listens, `http://127.0.0.1:4444` by default. The package carries a few such files under `browser/session/`, to pass as they are or to copy and edit: `chrome-headless.json` and `firefox-headless.json` launch the browser without a window, and `chrome-attach.json` attaches chromedriver to a Chrome already running with `--remote-debugging-port=9222`. The first reads:

```json
{"capabilities": {"alwaysMatch": {"goog:chromeOptions": {"args": ["--headless=new"]}}}}
```

The browser fetches the suite from this machine, so a driver on another one, Safari on a Mac reached over an SSH tunnel say, takes `--host` with an address that machine can reach.
