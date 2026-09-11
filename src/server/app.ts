// The browser test application: what to serve and where, for the suites, as
// one middleware in the shape of a Hono handler. It lays out the mounts,
// builds the import map, puts it into the pages and chains them with the
// channel to the page; the server that runs it is another's, serve.ts today.
// The CLI turns arguments into AppOptions; anything else could do the same.

import {resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {packageRoot} from "../extras/package-root.ts"
import type {ChannelOptions} from "./channel.ts"
import {createChannel} from "./channel.ts"
import {createFiles} from "./files.ts"
import {withHead} from "./head.ts"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose, scoped} from "./middleware.ts"
import {proxy} from "./proxy.ts"
import {serveStatic} from "./static.ts"
import type {Watcher} from "./watch.ts"
import {createWatcher} from "./watch.ts"

export interface AppOptions extends ChannelOptions {
    /** The suites, absolute, all served from one directory. Without any, the pages carry the library and no suite. */
    suites?: string[]
    /** Classic scripts to run before the suites, absolute, in this order. */
    scripts?: string[]
    /** Bare specifiers and the ES module files they resolve to. */
    aliases?: {specifier: string, file: string}[]
    /** What the root serves in place of htdocs: an absolute directory, or an http(s) URL ending in "/" to proxy. */
    mount?: string
    /** Reloads the page people open when a suite, a script or an alias changes; off where it cannot watch. */
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

// The package root holds dist/, esm/, exports/, htdocs/ and the IIFE's shim;
// they are served from there whatever the suite's location.
const root = fileURLToPath(packageRoot())

// This package stands in for node:test and node:assert in a browser: each
// builtin maps onto the subpath of the same name, and the subpaths resolve
// too. An alias adds its specifier on top.
const IMPORTS = {
    "test-assert-lite": "/@tal/esm/test-assert-lite.mjs",
    "test-assert-lite/test": "/@tal/exports/test.mjs",
    "test-assert-lite/assert": "/@tal/exports/assert.mjs",
    "test-assert-lite/assert/strict": "/@tal/exports/assert/strict.mjs",
    "node:test": "/@tal/exports/test.mjs",
    "node:assert": "/@tal/exports/assert.mjs",
    "node:assert/strict": "/@tal/exports/assert/strict.mjs",
}

/**
 * Builds the application for the suites: its middleware, and the promise
 * of the verdict the page at `page` reports back through it.
 */
export const createApp = (options: AppOptions): App => {
    const {suites = [], scripts = [], aliases = [], mount: mounted, stderr = text => process.stderr.write(text)} = options
    const channel = createChannel(options)

    // Watching is a convenience of --serve, not what it is for: where the
    // file system refuses, the inotify limit reached say, the page is
    // served all the same, without the reload, and stderr says why once.
    let watcher: Watcher | null = null
    if (options.watch) {
        try {
            watcher = createWatcher([...suites, ...scripts, ...aliases.map(alias => alias.file)])
        } catch (error) {
            stderr(`watch is off: ${error instanceof Error ? error.message : String(error)}\n`)
        }
    }

    // Every file given is served from its directory under /@tal/files/, so
    // a sibling or a nested import resolves beside it while nothing above
    // stays reachable; the suites' directory is the same for all of them.
    const served = createFiles([...suites, ...scripts, ...aliases.map(alias => alias.file)])

    // The build browsers get is the IIFE, so that is what runs: it goes in
    // as the first classic script, and the URL the import map and the
    // bridges lead to serves exports/global.mjs, the ES module face of its
    // global, in place of the ESM build.
    const scriptUrls = ["/@tal/dist/test-assert-lite.min.js", ...scripts.map(script => served.urlOf(script))]

    // The map has to be inline and in place before the first module loads;
    // classic script tags run in order as the head is parsed, and module
    // tags in order once it is, the suites in the order given as under
    // Node, ahead of the page's own module in the body that calls run(). So
    // all three go into the head of every HTML page served from htdocs/,
    // and of the run's page, as it goes out.
    const imports: Record<string, string> = {...IMPORTS}
    for (const {specifier, file} of aliases) imports[specifier] = served.urlOf(file)
    const importmap = `<script type="importmap">\n${JSON.stringify({imports}, null, 4)}\n</script>\n`
    const tags = scriptUrls.map(url => `<script src="${url}"></script>\n`).join("")
        + suites.map(suite => `<script type="module" src="${served.urlOf(suite)}"></script>\n`).join("")
    const head = withHead(importmap + tags)

    // The root serves htdocs/, or what --mount names in its place, a
    // directory or an upstream to proxy: whichever it is, its HTML gets the
    // head above and, with watch on, the ask that reloads it. The page the
    // CLI drives lives beside the CLI's other browser files and is served
    // under the run alone, with the head but no ask. Each is a chain of
    // its own, so the head reaches what that chain serves and nothing
    // served after it. Everything else the CLI provides sits under /@tal/,
    // the build output and the subpath bridges included, as those have to
    // stay where the package puts them; nothing there is touched.
    const atRoot = mounted == null
        ? serveStatic({path: "/", root: resolve(root, "htdocs")})
        : /^https?:\/\//i.test(mounted) ? proxy({path: "/", upstream: mounted}) : serveStatic({path: "/", root: mounted})
    const handler = compose([
        channel.handler,
        ...(watcher == null ? [] : [watcher.handler]),
        scoped(compose([head, serveStatic({path: `${channel.path}run.html`, root: resolve(root, "browser", "run.html")})])),
        serveStatic({path: "/@tal/esm/test-assert-lite.mjs", root: resolve(root, "exports", "global.mjs")}),
        serveStatic({path: "/@tal/dist/", root: resolve(root, "dist")}),
        serveStatic({path: "/@tal/exports/", root: resolve(root, "exports")}),
        ...served.dirs.map(dir => serveStatic(dir)),
        // /@tal/ is the CLI's: what none of the mounts above answered ends
        // here, whatever a mount or an upstream at the root would say to it.
        async (c, next) => (c.req.path.startsWith("/@tal/") ? c.notFound() : next()),
        scoped(compose([...(watcher == null ? [] : [watcher.inject]), head, atRoot])),
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
