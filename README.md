# test-assert-lite

[![Node.js CI](https://github.com/kawanet/test-assert-lite/workflows/Node.js%20CI/badge.svg?branch=main)](https://github.com/kawanet/test-assert-lite/actions/)

Run your `node:test` and `node:assert` test files in browsers, unchanged.

Four packages, one repository:

- [test-assert-lite](packages/test-assert-lite/README.md): A lightweight `node:test` and `node:assert` compatible library for browsers.
- [test-assert-cli](packages/test-assert-cli/README.md), `tacli`: Serve your `node:test` files to the browser, or run them in Node.js. test-assert-lite stands in for `node:test`.
- [webdriver-js-cli](packages/webdriver-js-cli/README.md), `webdriver-js`: Run ES modules written for Node.js in Safari, Chrome and Firefox over WebDriver.
- [playwright-js-cli](packages/playwright-js-cli/README.md), `chromium-js`, `firefox-js`, `webkit-js`: Run ES modules written for Node.js in Chromium, Firefox and WebKit through Playwright, or in a running Chromium over CDP.

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
