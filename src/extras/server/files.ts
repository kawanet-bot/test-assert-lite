// The files the browser test application serves, by directory, each named
// by a digest, so its URL is the same in every run with the path off the
// page. A directory under a served one is reached through it, as one file,
// unless node_modules lies between. A package's files are its own mount.

import {createHash} from "node:crypto"
import {realpathSync} from "node:fs"
import {dirname, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"
import {libraryRoot} from "../package-root.ts"

/** Where every directory is served under, each by its digest. */
export const FILES_PATH = "/@tacli/files/"

export interface Dir {
    /** The URL path, `/@tacli/files/<name>/`. */
    path: string
    /** The directory, absolute and real. */
    root: string
}

export interface Files {
    /** The directories the files are served from, in path order, so one before those under it. */
    dirs: Dir[]

    /** The directory one of the files is served from. */
    dirOf(file: string): Dir

    /** The URL a page refers to one of the files by, percent-encoded. */
    urlOf(file: string): string
}

// A file as the browser will identify it: its real path, so a symlink and
// its target are one file; a file that is not there stays as given and
// will be a 404 rather than an error here.
const realOf = (file: string): string => {
    try {
        return realpathSync(file)
    } catch {
        return resolve(file)
    }
}

// Nine hex digits of the directory's digest: the width of a run's id.
const nameOf = (dir: string): string => createHash("sha256").update(dir).digest("hex").slice(0, 9)

// The directory a file is served from: its own, or under node_modules the
// package's, so a module of the package reaches the rest of it by a
// relative import. A scoped package's name is two segments.
const rootOf = (file: string): string => {
    const parts = dirname(file).split(sep)
    const at = parts.lastIndexOf("node_modules")
    if (at < 0 || at + 1 >= parts.length) return dirname(file)
    const depth = parts[at + 1]!.startsWith("@") ? 2 : 1
    return parts.slice(0, Math.min(at + 1 + depth, parts.length)).join(sep)
}

// The minified build stands in for the entry it is built from, so a page
// gets the one that ships for it.
const own = fileURLToPath(libraryRoot())
const STAND_IN = new Map([[realOf(resolve(own, "dist", "test-assert-lite.js")), realOf(resolve(own, "dist", "test-assert-lite.min.js"))]])

/**
 * Lays out the directories the files are served from. A file inside a
 * served directory is served through it, unless node_modules lies
 * between. The order the files come in makes no difference.
 */
export const createFiles = (files: string[]): Files => {
    const reals = new Map(files.map(file => [file, realOf(file)]))
    // Sorted, a directory comes before the ones under it, as a prefix does.
    const names = [...new Set([...reals.values()].map(real => rootOf(real)))].sort()
    const dirs: Dir[] = []
    const inside = (root: string, dir: string): boolean =>
        dir === root || (dir.startsWith(root + sep) && !relative(root, dir).split(sep).includes("node_modules"))
    const within = (dir: string): Dir | undefined => dirs.find(({root}) => inside(root, dir))
    for (const dir of names) {
        if (within(dir) == null) dirs.push({path: `${FILES_PATH}${nameOf(dir)}/`, root: dir})
    }
    const servedAs = (file: string): string => {
        const real = reals.get(file) ?? realOf(file)
        return STAND_IN.get(real) ?? real
    }
    const dirOf = (file: string): Dir => {
        const dir = within(dirname(servedAs(file)))
        if (dir == null) throw new Error(`not among the files laid out: ${file}`)
        return dir
    }
    const urlOf = (file: string): string => {
        const dir = dirOf(file)
        return dir.path + relative(dir.root, servedAs(file)).split(sep).map(encodeURIComponent).join("/")
    }
    return {dirs, dirOf, urlOf}
}
