# playwright-js-cli

[![npm version](https://img.shields.io/npm/v/playwright-js-cli)](https://www.npmjs.com/package/playwright-js-cli)

Run ES modules written for Node.js in Chromium, Firefox and WebKit through [Playwright](https://playwright.dev/), or in a running Chromium over CDP.

- Test files written for `node:test` run unchanged, imports and all. Other ES modules run too
- `playwright` is installed as a dependency. Run `npx playwright install` once to get the browsers
- `--playwright-config` configures the browser launch, context and page. It can also attach to a running Chromium with `connectOverCDP`
- Accepts every [tacli](https://www.npmjs.com/package/test-assert-cli) option

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

## CDP - Chrome DevTools Protocol

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable --no-first-run &

chromium-js -e 'console.log("#", navigator.userAgent)' --playwright-config node_modules/playwright-js-cli/playwright-config/connect-over-cdp.json
# Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36
```

## CLI

`chromium-js`, `firefox-js` and `webkit-js` accept every `tacli` option, `--alias`, `--port` and the rest, as [test-assert-cli](https://www.npmjs.com/package/test-assert-cli) describes them, and add one of their own.

### `--playwright-config <file>`

- A JSON file. Each key names a Playwright method and holds its options, for example `newPage` for [newPage](https://playwright.dev/docs/api/class-browser#browser-new-page).
- Presets ship in `node_modules/playwright-js-cli/playwright-config/`. `iphone15pro.json` and `pixel9a.json` give the page a phone's viewport and user agent through `newPage`.
- A `connectOverCDP` key holds the endpoint URL of a Chromium running with remote debugging, or `[url, options]` for [connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp). The runner then attaches to that browser instead of launching one. `connect-over-cdp.json` names `http://127.0.0.1:9222`.
- An attached run opens its page in the browser's default context, unless `newContext` or `newPage` asks for a fresh one.

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://www.npmjs.com/package/webdriver-js-cli
- https://www.npmjs.com/package/playwright-js-cli
- https://github.com/kawanet/test-assert-lite
- https://playwright.dev/
