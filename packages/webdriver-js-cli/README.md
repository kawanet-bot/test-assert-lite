# webdriver-js-cli

[![npm version](https://img.shields.io/npm/v/webdriver-js-cli)](https://www.npmjs.com/package/webdriver-js-cli)

`webdriver-js` runs your `node:test` and `node:assert` test files in the browser a [WebDriver](https://w3c.github.io/webdriver/) server drives: `safaridriver`, `chromedriver` and others. It is [tacli](https://www.npmjs.com/package/test-assert-cli) fixed on WebDriver, with the flags that choose another mode left out.

```sh
npm install -D webdriver-js-cli

# Enable Safari automation once, then start the WebDriver server
safaridriver --enable
safaridriver -p 4444 &

webdriver-js -e 'console.log("#", navigator.userAgent)'
# Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15

webdriver-js --test test/query.test.mjs
```

## CLI

`webdriver-js` takes the options of `tacli`, `--alias`, `--import-map`, `--reporter`, `--port`, `--origin`, `--script`, `--mount` and the rest, as [test-assert-cli](https://www.npmjs.com/package/test-assert-cli) describes them, and two of its own.

- No extra dependency: the WebDriver server launches the browser, so Safari on a Mac runs the suite too, over an SSH tunnel if need be.

### `--webdriver-config <file>`

- JSON sent as the body of `POST /session`, the capabilities the driver takes. Default: `{"capabilities": {}}`.
- `webdriver-config/` in this package has a few to pass as they are or to copy and edit: `chrome-headless.json`, `firefox-headless.json`, `chrome-attach.json`.

### `--endpoint <url>`

- The WebDriver server. Default: `http://127.0.0.1:4444`.

## Safari over WebDriver

```sh
# Enable Safari automation once
safaridriver --enable

# Start the WebDriver server
safaridriver -p 4444 &

# Run a bundle of the suites in Safari
webdriver-js htdocs/scripts/bundled-tests.mjs
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
- https://w3c.github.io/webdriver/
