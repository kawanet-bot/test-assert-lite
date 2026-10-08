# webdriver-js-cli

[![npm version](https://img.shields.io/npm/v/webdriver-js-cli)](https://www.npmjs.com/package/webdriver-js-cli)

Run ES modules written for Node.js in Safari, Chrome and Firefox over [WebDriver](https://w3c.github.io/webdriver/).

- Test files written for `node:test` run unchanged, imports and all. Other ES modules run too
- Needs only a WebDriver server: `safaridriver`, `chromedriver` or `geckodriver`
- `--webdriver-config` passes capabilities to the driver. It ships with presets
- Accepts every [tacli](https://www.npmjs.com/package/test-assert-cli) option

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

`webdriver-js` accepts every `tacli` option, `--alias`, `--port` and the rest, as [test-assert-cli](https://www.npmjs.com/package/test-assert-cli) describes them, and adds two of its own.

### `--webdriver-config <file>`

- The JSON body of `POST /session`, which carries the capabilities the driver takes. Default: `{"capabilities": {}}`.
- Presets ship in `node_modules/webdriver-js-cli/webdriver-config/`. Pass one unchanged, or copy and edit it.
- `chrome-headless.json` and `firefox-headless.json` ask for a headless browser. `chrome-attach.json` attaches `chromedriver` to a Chrome running with `--remote-debugging-port=9222`.

### `--endpoint <url>`

- The WebDriver server. Default: `http://127.0.0.1:4444`, where `safaridriver -p 4444` and `geckodriver` listen.

## Firefox over WebDriver

```sh
# geckodriver listens on 4444, the default endpoint
geckodriver -p 4444 &

webdriver-js -e 'console.log("#", navigator.userAgent)'
# Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0

# Headless, with the preset
webdriver-js --webdriver-config node_modules/webdriver-js-cli/webdriver-config/firefox-headless.json --test test/query.test.mjs
```

## Chrome over WebDriver

```sh
# chromedriver listens on 9515
chromedriver &

webdriver-js --endpoint http://127.0.0.1:9515 -e 'console.log("#", navigator.userAgent)'

# Headless, with the preset
webdriver-js --endpoint http://127.0.0.1:9515 --webdriver-config node_modules/webdriver-js-cli/webdriver-config/chrome-headless.json --test test/query.test.mjs

# Or attach to a Chrome you have running with --remote-debugging-port=9222
webdriver-js --endpoint http://127.0.0.1:9515 --webdriver-config node_modules/webdriver-js-cli/webdriver-config/chrome-attach.json --test test/query.test.mjs
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
- https://w3c.github.io/webdriver/
