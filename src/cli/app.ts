// The browser test application: what to serve and where, for one suite.
// It lays out the mounts, builds the import map, puts it into the pages
// and hands all of that to server.ts. The CLI turns arguments into
// AppOptions; anything else could do the same.

import {readFileSync} from "node:fs"
import {basename, dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {startServer} from "./server.ts"

export interface AppOptions {
    /** The suite, as an absolute path. Its directory is mounted. */
    file: string
    /** Classic scripts to run before the suite, absolute, in this order. */
    scripts?: string[]
    /** Bare specifiers and the ES module files they resolve to. */
    aliases?: {specifier: string, file: string}[]
}

export interface App {
    /** Origin of the server, such as http://127.0.0.1:12345 */
    origin: string
    /** Classic script URLs on that origin, in the order to run them. */
    scripts: string[]
    /** Suite URLs on that origin, in the order to load them. */
    urls: string[]
    /** Stops the server. */
    close(): void
}

// The package root, holding dist/, exports/ and htdocs/. The pages and
// the build output are served from there whatever the suite's location.
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)))

// This package stands in for node:test and node:assert in a browser: each
// builtin maps onto the subpath of the same name, and the subpaths resolve
// too. An alias adds its specifier on top.
const IMPORTS = {
    "test-assert-lite": "/dist/test-assert-lite.mjs",
    "test-assert-lite/test": "/exports/test.mjs",
    "test-assert-lite/assert": "/exports/assert.mjs",
    "test-assert-lite/assert/strict": "/exports/assert/strict.mjs",
    "node:test": "/exports/test.mjs",
    "node:assert": "/exports/assert.mjs",
    "node:assert/strict": "/exports/assert/strict.mjs",
}

/**
 * Starts serving the suite and resolves once the server listens.
 */
export const startApp = async (options: AppOptions): Promise<App> => {
    const {file, scripts = [], aliases = []} = options

    // The suite's directory is mounted at /@tal/tests/0/, so a sibling or a
    // nested import resolves beside it while nothing above stays reachable;
    // an aliased module gets the same under /@tal/aliases/<n>/. A script
    // cannot import, so each is mounted on its own, percent-encoded.
    const urls = [`/@tal/tests/0/${encodeURIComponent(basename(file))}`]
    const scriptUrls = scripts.map((script, i) => `/@tal/scripts/${i}/${encodeURIComponent(basename(script))}`)
    const aliasDirs = aliases.map((_, i) => `/@tal/aliases/${i}/`)
    const aliasUrls = aliases.map(({file}, i) => `${aliasDirs[i]}${encodeURIComponent(basename(file))}`)

    // A map has to be inline and in place before the first module loads,
    // so it goes in at the end of each page's head, past any mention of
    // that tag in a comment.
    const imports: Record<string, string> = {...IMPORTS}
    for (const [i, {specifier}] of aliases.entries()) imports[specifier] = aliasUrls[i] as string
    const importmap = `<script type="importmap">\n${JSON.stringify({imports}, null, 4)}\n</script>\n`
    const withImportmap = (page: string): string => {
        const html = readFileSync(resolve(root, "htdocs", page), "utf8")
        const at = html.lastIndexOf("</head>")
        return html.slice(0, at) + importmap + html.slice(at)
    }
    const pages = ["console.html", "index.html"]

    // Document root is htdocs/, with /dist and /exports aliased onto the
    // build output and the subpath bridges, which have to stay where the
    // package puts them. Nothing else is exposed. index.html asks for both
    // lists and loads them itself, scripts first.
    const server = await startServer({
        root: resolve(root, "htdocs"),
        aliases: {
            "/dist/": resolve(root, "dist"),
            "/exports/": resolve(root, "exports"),
            "/@tal/tests/0/": dirname(file),
            ...Object.fromEntries(aliasDirs.map((dir, i) => [dir, dirname(aliases[i]?.file as string)])),
        },
        files: Object.fromEntries(scriptUrls.map((url, i) => [url, scripts[i] as string])),
        data: {
            "/@tal/scripts.json": {type: "application/json", body: JSON.stringify(scriptUrls)},
            "/@tal/tests.json": {type: "application/json", body: JSON.stringify(urls)},
            ...Object.fromEntries(pages.flatMap(page => {
                const body = {type: "text/html", body: withImportmap(page)}
                return page === "index.html" ? [[`/${page}`, body], ["/", body]] : [[`/${page}`, body]]
            })),
        },
    })

    return {origin: server.origin, scripts: scriptUrls, urls, close: () => server.close()}
}
