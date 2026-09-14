import path from "node:path"
import {fileURLToPath} from "node:url"
import type {Plugin} from "rollup"

type Testable = { test: (path: string) => boolean }

interface ShowFilesOptions {
    deny?: Testable,
    hide?: Testable,
    show?: Testable,
    gray?: Testable,
}

/**
 * Rollup plugin that logs or denies module the bundle pulls in.
 */
export const showFiles = ({deny, hide, show, gray}: ShowFilesOptions = {}): Plugin => {
    const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

    const useColors = !!process.stdout?.isTTY

    return {
        name: "show-files",
        load(id) {
            id = id.replace(projectRoot, "").replace(/^\//, "")

            if (deny && deny.test(id)) throw new Error(`denied: ${id}`)

            if (hide && hide.test(id)) return

            if (show && !show.test(id)) return

            if (useColors) {
                if (gray && gray.test(id)) {
                    id = COLOR.gray + id + COLOR.reset
                }
            }

            console.warn(`import: ${id}`)
        },
    }
}

const COLOR = {
    gray: "\u001b[90m",
    reset: "\u001b[39m",
} as const
