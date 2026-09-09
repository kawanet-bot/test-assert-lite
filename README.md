# test-assert-lite

## Command line

`test-assert` runs ES module test suites written against `node:test` and `node:assert` on this package.

```sh
test-assert test/*.mjs                              # in this Node process
test-assert --serve browser/tests/bundled.mjs                # serves the suite and prints the URL to open
test-assert --playwright chromium browser/tests/bundled.mjs  # in headless Chromium, through Playwright
```

The browser modes take one suite, bundled, and accept `--alias <specifier>=<file>` for an ES module a bare specifier should resolve to and `--script <file>` for a classic script to run first. `--host <address>` serves the suite on another address than 127.0.0.1, for a browser on another machine. `--playwright` takes `chromium`, `firefox` or `webkit`, and needs the `playwright` package and that browser (`npx playwright install chromium`); `--serve` needs neither.
