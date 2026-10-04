# test-assert-lite

[![npm version](https://img.shields.io/npm/v/test-assert-lite)](https://www.npmjs.com/package/test-assert-lite)
[![gzip size](https://img.badgesize.io/https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js?compression=gzip)](https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js)

Run your `node:test` and `node:assert` test files in browsers, as they are.

- The test file stays as written, imports included: [tacli](https://www.npmjs.com/package/test-assert-cli) maps `node:test` and `node:assert` to this library
- From `node:test`: `describe` / `it`, `test` with `t.test()` subtests, `before` / `after`, `skip` and `todo`
- From `node:assert`: `assert` and `strict`, with `ok`, `equal`, `deepStrictEqual`, `throws`, `rejects`, `match` and the rest
- One command per target with `tacli`: this Node.js process, headless Chromium, Firefox and WebKit, or Safari and others over WebDriver
- Under 32KB script, under 11KB gzipped, no dependencies

## SYNOPSIS

BDD style with `describe` and `it`:

```js
import {strict as assert} from "node:assert"
import {describe, it} from "node:test"

const parseQuery = (search) => Object.fromEntries(new URLSearchParams(search))
const buildQuery = (params) => new URLSearchParams(params).toString()

describe("buildQuery() from an object", () => {
    it("round-trips through parseQuery()", () => {
        const params = {q: "cat", page: "2"}
        assert.deepEqual(parseQuery("?" + buildQuery(params)), params)
    })
    it("appends to a URL", () => {
        const url = new URL("https://example.com/search")
        url.search = buildQuery({q: "cat"})
        assert.equal(url.href, "https://example.com/search?q=cat")
    })
    it("encodes a space as %20", () => {
        assert.equal(buildQuery({q: "black cat"}), "q=black%20cat")
    })
})
```

The same file runs with `node --test`, and in browsers with [tacli](https://www.npmjs.com/package/test-assert-cli):

```sh
node --test test/query.test.mjs

tacli --playwright chromium test/query.test.mjs
```

`test` with subtests:

```js
import {strict as assert} from "node:assert"
import {test} from "node:test"

test("URLSearchParams", async (t) => {
    const params = new URLSearchParams("a=1&b=2")
    await t.test("reads a key", () => {
        assert.equal(params.get("a"), "1")
    })
    await t.test("is null for a missing key", () => {
        assert.equal(params.get("c"), null)
    })
})
```

See [test-assert-lite.d.ts](https://github.com/kawanet/test-assert-lite/blob/main/packages/test-assert-lite/types/test-assert-lite.d.ts) for the supported API.

## BROWSER MODULE

Or skip the build: tests can go straight into a page.

The minified build is an ES module: an import map leads the package's name to it on a CDN.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/test-assert-cli/htdocs/styles/test-assert-lite.css">
<script type="importmap">
{
    "imports": {
        "test-assert-lite": "https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js",
        "test-assert-lite/test": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/test.js",
        "test-assert-lite/assert": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/assert.js",
        "test-assert-lite/process": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/process.js",
        "test-assert-lite/session": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/session.js"
    }
}
</script>
<div id="output"></div>
<script type="module">
    import {describe, it} from "test-assert-lite/test"
    import {strict as assert} from "test-assert-lite/assert"
    import {run, session} from "test-assert-lite/session"

    // The report goes to console.log by default; render it as HTML in the page instead.
    // session() comes before the first test is declared, and run() closes it.
    session({
        reporter: "html",
        output: html => document.getElementById("output").insertAdjacentHTML("beforeend", html),
    })

    describe("URL", () => {
        it("keeps the host", () => {
            assert.equal(new URL("https://example.com/a?b").host, "example.com")
        })
    })

    // run() starts every test registered so far and resolves once they are reported
    run().then(result => console.log(result.success ? "PASS" : "FAIL"))
</script>
```

### Bundled tests in a page

Bundle the suites as one ES module with `node:test` and `node:assert` left external, and let an import map lead them, and the package's name the bridges import, to the CDN.

```js
// rollup.config.mjs
export default {
    input: "test/*.test.mjs",
    external: [
        "node:assert",
        "node:test",
    ],
    output: {
        file: "htdocs/scripts/bundled-tests.js",
        format: "es",
    },
    treeshake: false,
}
```

```html
<script type="importmap">
{
    "imports": {
        "test-assert-lite": "https://cdn.jsdelivr.net/npm/test-assert-lite/dist/test-assert-lite.min.js",
        "node:test": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/test.js",
        "node:assert": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/assert.js",
        "node:assert/strict": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/assert/strict.js",
        "test-assert-lite/process": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/process.js",
        "test-assert-lite/session": "https://cdn.jsdelivr.net/npm/test-assert-lite/exports/session.js"
    }
}
</script>
<script type="module" src="./scripts/bundled-tests.js"></script>
<script type="module">
    import {run} from "test-assert-lite/session"
    run()
</script>
```

## SEE ALSO

- https://www.npmjs.com/package/test-assert-lite
- https://www.npmjs.com/package/test-assert-cli
- https://github.com/kawanet/test-assert-lite
- https://nodejs.org/api/test.html
- https://nodejs.org/api/assert.html
