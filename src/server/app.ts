// The browser test application: what to serve and where, for one suite, as
// one middleware in the shape of a Hono handler. It lays out the mounts,
// builds the import map, puts it into the pages and chains them with the
// channel to the page; the server that runs it is another's, serve.ts today.
// The CLI turns arguments into AppOptions; anything else could do the same.

import {readFileSync} from "node:fs"
import {basename, dirname, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {packageRoot} from "../extras/package-root.ts"
import type {ChannelOptions} from "./channel.ts"
import {createChannel} from "./channel.ts"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose} from "./middleware.ts"
import {serveStatic} from "./static.ts"
import type {Watcher} from "./watch.ts"
import {createWatcher} from "./watch.ts"

export interface AppOptions extends ChannelOptions {
    /** The suite, as an absolute path. Its directory is mounted. */
    file: string
    /** Classic scripts to run before the suite, absolute, in this order. */
    scripts?: string[]
    /** Bare specifiers and the ES module files they resolve to. */
    aliases?: {specifier: string, file: string}[]
    /** Reloads the page people open when the suite, a script or an alias changes; off where it cannot watch. */
    watch?: boolean
}

export interface App {
    /** Serves it all: the pages, the mounts and the channel to the page. */
    handler: MiddlewareHandler
    /** Path of the page a browser is sent to, under the run's own path. */
    page: string
    /** The verdict the page reports at its end; rejects if it never begins. */
    done: Promise<boolean>
    /** Stops waiting for the page. */
    close(): void
}

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

// A file mounted by name: the URL a page refers to it by, percent-encoded,
// and the path a request for it arrives as, decoded back to the name.
const mount = (dir: string, file: string): {url: string, path: string} => ({
    url: dir + encodeURIComponent(basename(file)),
    path: dir + basename(file),
})

const isRead = (method: string): boolean => method === "GET" || method === "HEAD"

// What --watch puts into the page people open: it asks after the version
// it was built with and reloads on an answer. A 204, the wait run out,
// means ask again at once; anything else, the server gone say, a second
// later, then two, then three, so a page left behind does not hammer.
const asks = (after: number): string => `<script>
(async after => {
    for (let wait = 1; ; wait++) {
        const res = await fetch(\`/@tal/watch?after=\${after}\`).catch(() => null)
        if (res?.status === 200) return location.reload()
        if (res?.status === 204) wait = 0
        await new Promise(next => setTimeout(next, wait * 1000))
    }
})(${after})
</script>
`

/**
 * Builds the application for the suite: its middleware, and the promise
 * of the verdict the page at `page` reports back through it.
 */
export const createApp = (options: AppOptions): App => {
    const {file, scripts = [], aliases = [], stderr = text => process.stderr.write(text)} = options
    const channel = createChannel(options)

    // Watching is a convenience of --serve, not what it is for: where the
    // file system refuses, the inotify limit reached say, the page is
    // served all the same, without the reload, and stderr says why once.
    let watcher: Watcher | null = null
    if (options.watch) {
        try {
            watcher = createWatcher([file, ...scripts, ...aliases.map(alias => alias.file)])
        } catch (error) {
            stderr(`watch is off: ${error instanceof Error ? error.message : String(error)}\n`)
        }
    }

    // The suite's directory is mounted at /@tal/tests/0/, so a sibling or a
    // nested import resolves beside it while nothing above stays reachable;
    // an aliased module gets the same under /@tal/aliases/<n>/. A script
    // cannot import, so each is mounted on its own.
    const suite = mount("/@tal/tests/0/", file)
    const mounts = scripts.map((script, i) => mount(`/@tal/scripts/${i}/`, script))

    // The build browsers get is the IIFE, so that is what runs: it goes in
    // as the first classic script, and the URL the import map and the
    // bridges lead to serves browser/import.mjs, the ES module face of its
    // global, in place of the ESM build.
    const scriptUrls = ["/@tal/dist/test-assert-lite.min.js", ...mounts.map(({url}) => url)]
    const aliasDirs = aliases.map((_, i) => `/@tal/aliases/${i}/`)
    const aliasUrls = aliases.map(({file}, i) => mount(aliasDirs[i] as string, file).url)

    // The map has to be inline and in place before the first module loads;
    // classic script tags run in order as the head is parsed, and module
    // tags in order once it is, ahead of the page's own module in the body
    // that calls run(). So all three go in at the end of each page's head,
    // past any mention of those tags in a comment.
    const imports: Record<string, string> = {...IMPORTS}
    for (const [i, {specifier}] of aliases.entries()) imports[specifier] = aliasUrls[i] as string
    const importmap = `<script type="importmap">\n${JSON.stringify({imports}, null, 4)}\n</script>\n`
    const tags = scriptUrls.map(url => `<script src="${url}"></script>\n`).join("")
        + `<script type="module" src="${suite.url}"></script>\n`
    const withHead = (path: string, extra = ""): string => {
        const html = readFileSync(resolve(root, path), "utf8")
        const at = html.lastIndexOf("</head>")
        return html.slice(0, at) + importmap + tags + extra + html.slice(at)
    }

    // Both pages live beside the CLI's other browser files and are built
    // as asked for: the one people open at the root, the one the CLI
    // drives under the run only. Only the former asks about changes.
    const INDEX = "browser/index.html"
    const pages: Record<string, string> = {
        "/": INDEX,
        "/index.html": INDEX,
        [`${channel.path}run.html`]: "browser/run.html",
    }
    const build = (page: string): string => withHead(page, watcher != null && page === INDEX ? asks(watcher.version) : "")

    // Document root is htdocs/, the files served as they are; everything
    // else the CLI provides sits under /@tal/, the build output and the
    // subpath bridges included, as those have to stay where the package
    // puts them. Nothing else is exposed.
    const handler = compose([
        channel.handler,
        ...(watcher == null ? [] : [watcher.handler]),
        async (c, next) => {
            const page = pages[c.req.path]
            if (page == null) return next()
            return isRead(c.req.method) ? c.html(build(page)) : c.body(null, 405, {allow: "GET, HEAD"})
        },
        serveStatic({path: "/@tal/dist/test-assert-lite.mjs", root: resolve(root, "browser", "import.mjs")}),
        ...mounts.map(({path}, i) => serveStatic({path, root: scripts[i] as string})),
        serveStatic({path: "/@tal/dist/", root: resolve(root, "dist")}),
        serveStatic({path: "/@tal/exports/", root: resolve(root, "exports")}),
        serveStatic({path: "/@tal/tests/0/", root: dirname(file)}),
        ...aliasDirs.map((dir, i) => serveStatic({path: dir, root: dirname(aliases[i]?.file as string)})),
        serveStatic({path: "/", root: resolve(root, "htdocs")}),
    ])

    return {
        handler,
        page: `${channel.path}run.html`,
        done: channel.done,
        close: () => {
            channel.close()
            watcher?.close()
        },
    }
}
