import {readFileSync} from "node:fs"
import {messageOf} from "./stringify.ts"

export const readJSON = <T extends object>(file: string): T | undefined => {
    const json = readFileSync(file, "utf8")
    if (!json) return
    try {
        const t: T = JSON.parse(json)
        if (t == null || Array.isArray(t)) throw new TypeError(Object.prototype.toString.call(t))
        if ("object" !== typeof t) throw new TypeError(`typeof ${typeof t}`)
        return t
    } catch (e) {
        throw new Error(`Invalid JSON in "${file.replace(/^[^?]*\//, "")}": ${messageOf(e)}`)
    }
}
