# test-assert-lite

## Command line

`test-assert` runs ES module test suites written against `node:test` and `node:assert` on this package.

```sh
test-assert test/*.mjs                              # in this Node process
test-assert --chromium browser/tests/bundled.mjs    # in headless Chromium, through Playwright
test-assert --serve browser/tests/bundled.mjs       # serves the suite and prints the URL to open
```

The browser modes take one suite, bundled, and accept `--script <file>` for a classic script to run first and `--alias <specifier>=<file>` for an ES module a bare specifier should resolve to. `--chromium` needs the `playwright` package and a browser (`npx playwright install chromium`); `--serve` needs neither.
