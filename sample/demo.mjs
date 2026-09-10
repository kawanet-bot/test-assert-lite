// A small suite for a look at what the spec reporter prints: two suites
// under one, a few passing tests and one that fails on purpose, so the
// failure list at the end has an entry. Written against node:test, it
// runs under `node --test` as it is, and under `test-assert` in Node or
// in a browser.
import {describe, it} from "node:test"
import {strict as assert} from "node:assert"

const parseQuery = (search) => Object.fromEntries(new URLSearchParams(search))
const buildQuery = (params) => new URLSearchParams(params).toString()

describe("query string helpers", () => {
    describe("parseQuery() on a search string", () => {
        it("reads a single pair", () => {
            assert.deepEqual(parseQuery("?q=cat"), {q: "cat"})
        })
        it("decodes percent-encoded values", () => {
            assert.deepEqual(parseQuery("?q=caf%C3%A9"), {q: "café"})
        })
        it("returns an empty object for no query", () => {
            assert.deepEqual(parseQuery(""), {})
        })
    })

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
        // URLSearchParams writes a space as "+", so this one fails.
        it("encodes a space as %20", () => {
            assert.equal(buildQuery({q: "black cat"}), "q=black%20cat")
        })
    })
})
