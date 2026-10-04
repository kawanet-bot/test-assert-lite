# playwright-js-cli

[![npm version](https://img.shields.io/npm/v/playwright-js-cli)](https://www.npmjs.com/package/playwright-js-cli)

`chromium-js`, `firefox-js` and `webkit-js` run your `node:test` and `node:assert` test files in a headless browser through [Playwright](https://playwright.dev/). Each is [tacli](https://www.npmjs.com/package/test-assert-cli) fixed on that engine, with the flags that choose another mode left out.

```sh
npm install -D playwright-js-cli
npx playwright install chromium firefox webkit

chromium-js -e 'console.log("#", navigator.userAgent)'
# Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.8010.12 Safari/537.36

firefox-js -e 'console.log("#", navigator.userAgent)'
# Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:155.0) Gecko/20100101 Firefox/155.0

webkit-js -e 'console.log("#", navigator.userAgent)'
# Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15

chromium-js --test test/query.test.mjs
```

- `playwright` comes with this package. The browsers do not: `npx playwright install chromium`, `firefox` or `webkit` downloads the one a command needs.
- `--playwright-config <file>`: JSON options passed to Playwright's [launch](https://playwright.dev/docs/api/class-browsertype#browser-type-launch), [newPage](https://playwright.dev/docs/api/class-browser#browser-new-page) and [goto](https://playwright.dev/docs/api/class-page#page-goto) methods.
- Every other option of `tacli` applies as it is: `--alias`, `--import-map`, `--reporter`, `--port`, `--origin`, `--script`, `--mount` and the rest. See [test-assert-cli](https://www.npmjs.com/package/test-assert-cli).

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
- https://playwright.dev/
