# playwright-js-cli

[![npm version](https://img.shields.io/npm/v/playwright-js-cli)](https://www.npmjs.com/package/playwright-js-cli)

Run Node.js ES modules in Chromium, Firefox and WebKit, through [Playwright](https://playwright.dev/) or CDP.

- `node:test` suites first of all, as they are
- `playwright` comes with the package. One `npx playwright install` for the browser
- `--playwright-config` for the launch, the context and the page, or `connectOverCDP` to attach to a Chromium already running
- Every option of [tacli](https://www.npmjs.com/package/test-assert-cli)

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

## CLI

`chromium-js`, `firefox-js` and `webkit-js` take the options of `tacli`, `--alias`, `--import-map`, `--reporter`, `--port`, `--origin`, `--script`, `--mount` and the rest, as [test-assert-cli](https://www.npmjs.com/package/test-assert-cli) describes them, and one of their own.

### `--playwright-config <file>`

- JSON options passed to Playwright's [launch](https://playwright.dev/docs/api/class-browsertype#browser-type-launch), [newContext](https://playwright.dev/docs/api/class-browser#browser-new-context), [newPage](https://playwright.dev/docs/api/class-browser#browser-new-page) and [goto](https://playwright.dev/docs/api/class-page#page-goto) methods, under those names.
- A `connectOverCDP` entry, the endpoint URL of a Chromium running with remote debugging, attaches to that browser in place of launching one, as [connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp) does. The page opens in that browser's own context, unless `newContext` or `newPage` asks for a context of the run's own.

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
- https://playwright.dev/
