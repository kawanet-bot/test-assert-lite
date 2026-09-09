// Loopback static server behind the browser test CLI. It knows nothing
// about Playwright or the suites: a document root, directory aliases and
// single-file mounts are all it serves, so it can later ship inside the
// CLI itself.

import {readFile, realpath} from "node:fs/promises"
import type {IncomingMessage, ServerResponse} from "node:http"
import {createServer} from "node:http"
import {extname, resolve, sep} from "node:path"

export interface ServerOptions {
    /** Document root: every path not matched below resolves under it. */
    root: string
    /** URL prefix ending in "/" to a directory, checked before the root. */
    aliases?: Record<string, string>
    /** Exact URL path to a file, for files outside every directory above. */
    files?: Record<string, string>
    /** Exact URL path to a response built in memory, checked first. */
    data?: Record<string, {type: string, body: string}>
    /** Address to listen on; 127.0.0.1 by default. */
    host?: string
}

export interface Server {
    origin: string

    close(): void
}

const TYPES: Record<string, string> = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".mjs": "text/javascript",
}

// A candidate file and the directory it must stay in; `base` is null for
// a file mounted by name, which is served as given.
interface Located {
    base: string | null
    path: string
}

// The browser percent-encodes what it requests, so the path is decoded
// before it meets the file system; a malformed escape is a 404. A resolved
// path that leaves the directory, through "..", is refused.
const within = (dir: string, rel: string): Located | null => {
    const base = resolve(dir)
    let path: string
    try {
        path = resolve(base, decodeURIComponent(rel))
    } catch {
        return null
    }
    return path.startsWith(base + sep) ? {base, path} : null
}

// A directory path gets its index.html, as any document root would; there
// is no listing otherwise.
const locate = (options: ServerOptions, pathname: string): Located | null => {
    const file = options.files?.[pathname]
    if (file != null) return {base: null, path: file}
    const rel = pathname.endsWith("/") ? pathname + "index.html" : pathname
    for (const [prefix, dir] of Object.entries(options.aliases ?? {})) {
        if (rel.startsWith(prefix)) return within(dir, rel.slice(prefix.length))
    }
    return within(options.root, rel.slice(1))
}

// The check above is lexical; a symlink inside the directory could still
// point above it and readFile would follow. So the real path is checked
// against the directory's real path too, and that is what gets read.
const realWithin = async ({base, path}: Located): Promise<string> => {
    const real = await realpath(path)
    if (base != null && !real.startsWith((await realpath(base)) + sep)) throw new Error("outside")
    return real
}

const respond = async (options: ServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const {pathname} = new URL(req.url ?? "/", "http://127.0.0.1")
    const data = options.data?.[pathname]
    if (data != null) {
        res.writeHead(200, {"content-type": `${data.type}; charset=utf-8`})
        res.end(data.body)
        return
    }
    const found = locate(options, pathname)
    // Only the kinds a test page is made of are served; anything else on
    // disk, a .cjs or a .ts say, is refused rather than handed out as bytes.
    const type = found == null ? undefined : TYPES[extname(found.path)]
    if (found != null && type == null) {
        res.writeHead(403)
        res.end()
        return
    }
    try {
        if (found == null) throw new Error("outside")
        const body = await readFile(await realWithin(found))
        res.writeHead(200, {"content-type": `${type}; charset=utf-8`})
        res.end(body)
    } catch {
        res.writeHead(404)
        res.end()
    }
}

// 127.0.0.1 rather than localhost on both ends: a browser may resolve
// localhost to ::1 while this listens on IPv4 only. Port 0 picks a free one.
// A wildcard address listens on every interface but names none, so the
// origin falls back to the loopback one; an IPv6 literal needs brackets.
export const startServer = async (options: ServerOptions): Promise<Server> => {
    const host = options.host || "127.0.0.1"
    const named = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host
    const server = createServer((req, res) => respond(options, req, res))
    await new Promise<void>(listening => server.listen(0, host, listening))
    const address = server.address()
    const port = (typeof address === "object" && address != null) ? address.port : 0
    return {
        origin: `http://${named}:${port}`,
        close: () => {
            server.close()
            server.closeAllConnections()
        },
    }
}
