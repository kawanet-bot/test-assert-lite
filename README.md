# test-assert-lite

[![Node.js CI](https://github.com/kawanet/test-assert-lite/workflows/Node.js%20CI/badge.svg?branch=main)](https://github.com/kawanet/test-assert-lite/actions/)

Run your `node:test` and `node:assert` test files in browsers, as they are.

Four packages, one repository:

- [test-assert-lite](packages/test-assert-lite/README.md): the library. `node:test` and `node:assert` for a browser, under 32KB, no dependencies. On npm as [test-assert-lite](https://www.npmjs.com/package/test-assert-lite).
- [test-assert-cli](packages/test-assert-cli/README.md): the command line `tacli`. Runs a test file in Node.js, in headless Chromium, Firefox and WebKit, or in Safari and others over WebDriver. On npm as [test-assert-cli](https://www.npmjs.com/package/test-assert-cli).
- [webdriver-js-cli](packages/webdriver-js-cli/README.md): `webdriver-js`, the command line fixed on the browser a WebDriver server drives. On npm as [webdriver-js-cli](https://www.npmjs.com/package/webdriver-js-cli).
- [playwright-js-cli](packages/playwright-js-cli/README.md): `chromium-js`, `firefox-js` and `webkit-js`, the command line fixed on one of Playwright's headless browsers. On npm as [playwright-js-cli](https://www.npmjs.com/package/playwright-js-cli).

```sh
npm install -D playwright-js-cli
npx playwright install chromium

chromium-js test/query.test.mjs
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://github.com/kawanet/test-assert-lite
- https://nodejs.org/api/test.html
- https://nodejs.org/api/assert.html
