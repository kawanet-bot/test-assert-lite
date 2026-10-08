# test-assert-lite

[![Node.js CI](https://github.com/kawanet/test-assert-lite/workflows/Node.js%20CI/badge.svg?branch=main)](https://github.com/kawanet/test-assert-lite/actions/)

Run your `node:test` and `node:assert` test files in browsers, as they are.

Four packages, one repository:

- [test-assert-lite](packages/test-assert-lite/README.md): the library. `node:test` and `node:assert` for a browser, under 32KB, no dependencies.
- [test-assert-cli](packages/test-assert-cli/README.md): the command line `tacli`. Runs a test file in Node.js, in headless Chromium, Firefox and WebKit, or in Safari and others over WebDriver.
- [webdriver-js-cli](packages/webdriver-js-cli/README.md): `webdriver-js`, the command line fixed on the browser a WebDriver server drives.
- [playwright-js-cli](packages/playwright-js-cli/README.md): `chromium-js`, `firefox-js` and `webkit-js`, the command line fixed on one of Playwright's headless browsers.

```sh
npm install -D playwright-js-cli
npx playwright install chromium

chromium-js test/query.test.mjs
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
