# webdriver-js-cli

[![npm version](https://img.shields.io/npm/v/webdriver-js-cli)](https://www.npmjs.com/package/webdriver-js-cli)

Run Node.js ES modules in Safari, Chrome and Firefox, over [WebDriver](https://w3c.github.io/webdriver/).

- `node:test` suites first of all, as they are
- No dependency beyond the driver. `safaridriver`, `chromedriver`, `geckodriver`
- A browser on another machine too, over an SSH tunnel
- `--webdriver-config` for the capabilities, presets included
- Every option of [tacli](https://www.npmjs.com/package/test-assert-cli)

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
