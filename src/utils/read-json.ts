import {readFileSync} from "node:fs"
import {messageOf} from "./stringify.ts"

export const readJsonFile = <T extends object>(file: string, thrower?: (e: string) => Error): T => {
    let json: string

    try {
        json = readFileSync(file, "utf8")
    } catch (e) {
        throw thrower ? thrower(messageOf(e)) : e
    }

    return parseJsonString<T>(json!, file, thrower)
}

export const parseJsonString = <T extends object>(json: string, file: string, thrower?: (e: string) => Error): T => {
    try {
        const t: T = JSON.parse(json)
        if (t == null || Array.isArray(t)) throw new TypeError(Object.prototype.toString.call(t))
        if ("object" !== typeof t) throw new TypeError(`typeof ${typeof t}`)
        return t
    } catch (e) {
        const message = `Invalid JSON format in "${file.replace(/^[^?]*\//, "")}": ${messageOf(e)}`
        throw thrower ? thrower(message) : new Error(message)
    }
}
