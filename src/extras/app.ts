// The browser test application: what to serve and where, for one suite.
// It lays out the mounts, builds the import map, puts it into the pages
// and hands all of that to server.ts. The CLI turns arguments into
// AppOptions; anything else could do the same.

import {randomUUID} from "node:crypto"
import {readFileSync} from "node:fs"
import {basename, dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {packageRoot} from "./package-root.ts"
import {startServer} from "./server.ts"

export interface AppOptions {
    /** The suite, as an absolute path. Its directory is mounted. */
    file: string
    /** Classic scripts to run before the suite, absolute, in this order. */
    scripts?: string[]
    /** Bare specifiers and the ES module files they resolve to. */
    aliases?: {specifier: string, file: string}[]
    /** Address the server listens on; 127.0.0.1 by default. */
    host?: string
}

export interface App {
    /** Origin of the server, such as http://127.0.0.1:12345 */
    origin: string
    /** Suite URLs on that origin, in the order to load them. */
    urls: string[]
    /** The verdict the page reports at its end; rejects if it never begins. */
    done: Promise<boolean>
    /** Stops the server. */
    close(): void
}

// How long the page may stay silent. Before it has begun, the browser
// could not reach the server, most likely; after that, a quiet page says
// so every ten seconds, so silence this long means the browser, its tab
// or the session is gone. A hung test is not silence, and waits as it would
// under node --test.
const SILENCE_MS = 30_000

// The package root holds dist/, exports/, htdocs/ and the IIFE's shim;
// they are served from there whatever the suite's location.
const root = fileURLToPath(packageRoot())

// This package stands in for node:test and node:assert in a browser: each
// builtin maps onto the subpath of the same name, and the subpaths resolve
// too. An alias adds its specifier on top.
const IMPORTS = {
    "test-assert-lite": "/@tal/dist/test-assert-lite.mjs",
    "test-assert-lite/test": "/@tal/exports/test.mjs",
    "test-assert-lite/assert": "/@tal/exports/assert.mjs",
    "test-assert-lite/assert/strict": "/@tal/exports/assert/strict.mjs",
    "node:test": "/@tal/exports/test.mjs",
    "node:assert": "/@tal/exports/assert.mjs",
    "node:assert/strict": "/@tal/exports/assert/strict.mjs",
}

/**
 * Starts serving the suite and resolves once the server listens.
 */
export const startApp = async (options: AppOptions): Promise<App> => {
    const {file, scripts = [], aliases = [], host} = options

    // The suite's directory is mounted at /@tal/tests/0/, so a sibling or a
    // nested import resolves beside it while nothing above stays reachable;
    // an aliased module gets the same under /@tal/aliases/<n>/. A script
    // cannot import, so each is mounted on its own, percent-encoded.
    const urls = [`/@tal/tests/0/${encodeURIComponent(basename(file))}`]
    const mounts = scripts.map((script, i) => `/@tal/scripts/${i}/${encodeURIComponent(basename(script))}`)

    // The build browsers get is the IIFE, so that is what runs: it goes in
    // as the first classic script, and the URL the import map and the
    // bridges lead to serves browser/import.mjs, the ES module face of its
    // global, in place of the ESM build.
    const scriptUrls = ["/@tal/dist/test-assert-lite.min.js", ...mounts]
    const aliasDirs = aliases.map((_, i) => `/@tal/aliases/${i}/`)
    const aliasUrls = aliases.map(({file}, i) => `${aliasDirs[i]}${encodeURIComponent(basename(file))}`)

    // The page reports back under a URL only this run knows: the client it
    // imports by the package name is served there and takes the run's id
    // from its own URL, so nothing else on the network can write into the
    // CLI's streams or hand in the verdict.
    const run = `/@tal/run/${randomUUID()}/`

    // The map has to be inline and in place before the first module loads,
    // and classic script tags run in order as the head is parsed, ahead of
    // any module script: so both go in at the end of each page's head,
    // past any mention of those tags in a comment.
    const imports: Record<string, string> = {...IMPORTS, "test-assert-lite/client": `${run}client.mjs`}
    for (const [i, {specifier}] of aliases.entries()) imports[specifier] = aliasUrls[i] as string
    const importmap = `<script type="importmap">\n${JSON.stringify({imports}, null, 4)}\n</script>\n`
    const tags = scriptUrls.map(url => `<script src="${url}"></script>\n`).join("")
    const withHead = (page: string): string => {
        const html = readFileSync(resolve(root, "htdocs", page), "utf8")
        const at = html.lastIndexOf("</head>")
        return html.slice(0, at) + importmap + tags + html.slice(at)
    }
    const pages = ["console.html", "index.html", "webdriver.html"]

    // The verdict: true from the page's end alone passes, anything else
    // fails, and nothing more is taken once it is in. Every word from the
    // page restarts the silence bound; a run nobody awaits, --serve, lapses.
    let begun = false
    let ended = false
    let settle: (success: boolean) => void = () => undefined
    let lapse: (error: Error) => void = () => undefined
    const done = new Promise<boolean>((resolve, reject) => {
        settle = resolve
        lapse = reject
    })
    void done.catch(() => undefined)
    let timer: ReturnType<typeof setTimeout> | null = null
    const heard = (): void => {
        if (timer != null) clearTimeout(timer)
        if (ended) return
        timer = setTimeout(() => lapse(new Error(begun
            ? "No word from the page for 30 seconds: the browser, its tab or the session is gone"
            : `The page never reported in: is ${server.origin} reachable from the browser?`)), SILENCE_MS)
        timer.unref()
    }
    const stream = (write: (text: string) => void) => (body: string) => {
        heard()
        if (!ended) write(body)
    }

    // Document root is htdocs/; everything else the CLI provides sits under
    // /@tal/, the build output and the subpath bridges included, as those
    // have to stay where the package puts them. Nothing else is exposed.
    // The pages ask for the suite list and load it themselves.
    // Every request on stderr, apart from the reporter's stdout: a 404 for
    // a mistyped --script or --alias shows up here.
    const server = await startServer({
        host,
        root: resolve(root, "htdocs"),
        log: line => process.stderr.write(`${line}\n`),
        post: {
            [`${run}begin`]: () => {
                begun = true
                heard()
            },
            [`${run}stdout`]: stream(text => process.stdout.write(text)),
            [`${run}stderr`]: stream(text => process.stderr.write(text)),
            [`${run}end`]: body => {
                ended = true
                heard()
                settle(body === "true")
            },
        },
        aliases: {
            "/@tal/dist/": resolve(root, "dist"),
            "/@tal/exports/": resolve(root, "exports"),
            "/@tal/tests/0/": dirname(file),
            ...Object.fromEntries(aliasDirs.map((dir, i) => [dir, dirname(aliases[i]?.file as string)])),
        },
        files: {
            "/@tal/dist/test-assert-lite.mjs": resolve(root, "browser", "import.mjs"),
            [`${run}client.mjs`]: resolve(root, "browser", "client.mjs"),
            ...Object.fromEntries(mounts.map((url, i) => [url, scripts[i] as string])),
        },
        data: {
            "/@tal/tests.json": {type: "application/json", body: JSON.stringify(urls)},
            ...Object.fromEntries(pages.flatMap(page => {
                const body = {type: "text/html", body: withHead(page)}
                return page === "index.html" ? [[`/${page}`, body], ["/", body]] : [[`/${page}`, body]]
            })),
        },
    })

    heard()
    return {
        origin: server.origin,
        urls,
        done,
        close: () => {
            if (timer != null) clearTimeout(timer)
            server.close()
        },
    }
}
