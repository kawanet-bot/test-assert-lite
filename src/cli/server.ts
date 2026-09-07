// Loopback static server behind the browser test CLI. It knows nothing
// about Playwright or the suites: a document root, directory aliases and
// single-file mounts are all it serves, so it can later ship inside the
// CLI itself.

import {readFile} from "node:fs/promises"
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

// A resolved path that leaves the directory, through "..", is refused.
const within = (dir: string, rel: string): string | null => {
    const base = resolve(dir)
    const path = resolve(base, rel)
    return path.startsWith(base + sep) ? path : null
}

const locate = (options: ServerOptions, pathname: string): string | null => {
    const file = options.files?.[pathname]
    if (file != null) return file
    for (const [prefix, dir] of Object.entries(options.aliases ?? {})) {
        if (pathname.startsWith(prefix)) return within(dir, pathname.slice(prefix.length))
    }
    return within(options.root, pathname.slice(1))
}

const respond = async (options: ServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = locate(options, new URL(req.url ?? "/", "http://127.0.0.1").pathname)
    try {
        if (path == null) throw new Error("outside")
        const body = await readFile(path)
        res.writeHead(200, {"content-type": `${TYPES[extname(path)] ?? "application/octet-stream"}; charset=utf-8`})
        res.end(body)
    } catch {
        res.writeHead(404)
        res.end()
    }
}

// 127.0.0.1 rather than localhost on both ends: a browser may resolve
// localhost to ::1 while this listens on IPv4 only. Port 0 picks a free one.
export const startServer = async (options: ServerOptions): Promise<Server> => {
    const server = createServer((req, res) => respond(options, req, res))
    await new Promise<void>(listening => server.listen(0, "127.0.0.1", listening))
    const address = server.address()
    const port = (typeof address === "object" && address != null) ? address.port : 0
    return {
        origin: `http://127.0.0.1:${port}`,
        close: () => {
            server.close()
            server.closeAllConnections()
        },
    }
}
