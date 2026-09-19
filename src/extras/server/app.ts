// The browser test application: what to serve and where, for the suites, as
// one middleware in the shape of a Hono handler. It lays out the mounts,
// builds the import map, puts it into the pages and chains them with the
// channel to the page; the server that runs it is another's, serve.ts today.
// The CLI turns arguments into AppOptions; anything else could do the same.

import {basename, resolve} from "node:path"
import {fileURLToPath} from "node:url"
import {Imports} from "../imports.ts"
import type {TestSession} from "../mode-options.ts"
import {packageNameOf, packageRoot} from "../package-root.ts"
import type {ChannelOptions} from "./channel.ts"
import {createChannel} from "./channel.ts"
import {createFiles} from "./files.ts"
import {hasImportMap, withHead} from "./head.ts"
import type {MiddlewareHandler} from "./middleware.ts"
import {compose, scoped} from "./middleware.ts"
import {proxy} from "./proxy.ts"
import {serveStatic} from "./static.ts"
import {withTitle} from "./title.ts"
import {withStrippedTypes} from "./typestrip.ts"
import type {Watcher} from "./watch.ts"
import {createWatcher} from "./watch.ts"

export interface AppOptions extends ChannelOptions {
    /** Classic scripts to run before the suites, absolute, in this order. */
    scripts?: string[]
    /** Specifiers and what they resolve to: a file, served from its directory, or a URL put into the map as it is. */
    imports?: Imports
    /** What the root serves in place of htdocs: an absolute directory, or an http(s) URL ending in "/" to proxy. */
    mount?: string
    /** What the command line hands the page, as JSON in its head; empty options unless given. Its files become the suites' served URLs. */
    session: TestSession
    /** Reloads the page people open when a suite, a script or an imported file changes; off where it cannot watch. */
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

interface TestSessionJSON {
    session: TestSession
}

export const TestSessionType = "application/vnd.test-session+json"

// The package root holds the pages, htdocs/ and browser/run.html; they
// are served from there whatever the suite's location.
const root = fileURLToPath(packageRoot())

// JSON for a script tag: a "<" in a value, "</script>" say, is escaped so
// it cannot close the tag, and reads back as the same string.
const safeJSON = (value: unknown): string => JSON.stringify(value, null, 4).replace(/</g, "\\u003c")

const M = (fn: MiddlewareHandler | undefined | false) => [fn].filter(Boolean) as MiddlewareHandler[]

/**
 * Builds the application for the suites: its middleware, and the promise
 * of the verdict the page at `page` reports back through it.
 */
export const createApp = (options: AppOptions): App => {
    const {scripts = [], imports = new Imports([]), mount: mounted, session, stderr = text => process.stderr.write(text)} = options
    const {files = []} = session
    const channel = createChannel(options)

    // Watching is a convenience of --serve, not what it is for: where the
    // file system refuses, the inotify limit reached say, the page is
    // served all the same, without the reload, and stderr says why once.
    let watcher: Watcher | null = null
    if (options.watch) {
        try {
            watcher = createWatcher([...files, ...scripts, ...imports.paths()])
        } catch (error) {
            stderr(`watch is off: ${error instanceof Error ? error.message : String(error)}\n`)
        }
    }

    // Every file given is served from its directory under /@tal/files/, so
    // a sibling or a nested import resolves beside it while nothing above
    // stays reachable; the suites' directory is the same for all of them.
    const served = createFiles([...files, ...scripts, ...imports.paths()])

    // The package's name in the map leads to the minified build, so the
    // library loads as the suites import it; only the scripts go in as tags.
    const scriptUrls = scripts.map(script => served.urlOf(script))

    // The map goes ahead of the page's first script, so the page's own
    // module imports the package by name; the scripts go at the end of
    // the head. The suites are the config's files, by their served URLs,
    // for the page to import in that order, as the Node driver does.
    const importmap = `<script type="importmap">\n${safeJSON({imports: imports.addresses(file => served.urlOf(file))})}\n</script>\n`
    const configObj: TestSessionJSON = {session: {...session, files: files.map(file => served.urlOf(file))}}
    const configTag = `<script type="${TestSessionType}">\n${safeJSON(configObj)}\n</script>\n`
    const tags = scriptUrls.map(url => `<script src="${url}"></script>\n`).join("")
    // A page with an import map of its own goes out as it is: a second map
    // is not for a browser, and without this one the suites cannot load,
    // so the config and the scripts stay out too. stderr says so.
    const head = withHead((html, path) => {
        if (!hasImportMap(html)) return {ahead: importmap + configTag, end: tags}
        stderr(`import map of its own, left as it is: ${path}\n`)
        return ""
    })

    // Add the generated head only to the root and run pages.
    const atRoot = mounted == null
        ? serveStatic({path: "/", root: resolve(root, "htdocs")})
        : /^https?:\/\//i.test(mounted)
            ? proxy({path: "/", upstream: mounted})
            : serveStatic({path: "/", root: mounted})

    const atRun = serveStatic({path: `${channel.path}run.html`, root: resolve(root, "browser", "run.html")})

    // The CLI's own pages are named after what they run: the package each
    // suite belongs to, or the suite's own name where there is none.
    const names = files.map(file => packageNameOf(file) ?? basename(file))
    const title = withTitle([...new Set(names)].join(" ") || "test-assert-lite")
    const handler = compose([
        channel.handler,
        ...M(watcher?.handler),
        scoped(compose([...M(watcher?.inject), head, title, atRun])),
        ...served.own.map(dir => serveStatic(dir)),
        // A .ts among the files given goes out as JavaScript; the root
        // mount is served as it is.
        scoped(compose([withStrippedTypes(), ...served.dirs.map(dir => serveStatic(dir))])),
        // /@tal/ is the CLI's: what none of the mounts above answered ends
        // here, whatever a mount or an upstream at the root would say to it.
        async (c, next) => (c.req.path.startsWith("/@tal/") ? c.notFound() : next()),
        scoped(compose([...M(watcher?.inject), head, ...M(!mounted && title), atRoot])),
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
