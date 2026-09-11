// The files the browser test application serves, by directory: one mount
// per directory, named by a digest of it so that the same directory gets
// the same URL in every run and the path itself stays off the page. A
// directory under another one served is not mounted on its own: its files
// are reached through the ancestor, so a module two files share is one
// URL, hence one instance, as it is one file under Node.

import {createHash} from "node:crypto"
import {realpathSync} from "node:fs"
import {dirname, relative, resolve, sep} from "node:path"

export interface Dir {
    /** The URL path, `/@tal/files/<name>/`. */
    path: string
    /** The directory, absolute and real. */
    root: string
}

export interface Files {
    /** The directories served, in path order, so one before those under it. */
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

/**
 * Lays out the directories the files are served from: every file's own,
 * except one inside another's, which is served through that one. The
 * order the files come in makes no difference to the layout.
 */
export const createFiles = (files: string[]): Files => {
    const reals = new Map(files.map(file => [file, realOf(file)]))
    // Sorted, a directory comes before the ones under it, as a prefix does.
    const names = [...new Set([...reals.values()].map(real => dirname(real)))].sort()
    const dirs: Dir[] = []
    const within = (dir: string): Dir | undefined => dirs.find(({root}) => dir === root || dir.startsWith(root + sep))
    for (const dir of names) {
        if (within(dir) == null) dirs.push({path: `/@tal/files/${nameOf(dir)}/`, root: dir})
    }
    const dirOf = (file: string): Dir => {
        const dir = within(dirname(reals.get(file) ?? realOf(file)))
        if (dir == null) throw new Error(`not among the files laid out: ${file}`)
        return dir
    }
    const urlOf = (file: string): string => {
        const dir = dirOf(file)
        return dir.path + relative(dir.root, reals.get(file) ?? realOf(file)).split(sep).map(encodeURIComponent).join("/")
    }
    return {dirs, dirOf, urlOf}
}
