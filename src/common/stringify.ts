import {isError} from "./is-error.ts"

// Render a value as one readable line. Arrays expand two levels deep and
// fold to "..." below that, since recursing without a limit overflows on a
// circular reference. The marker keeps an elision from reading as real
// data, and an empty array is never folded for the same reason.
export const stringify = (value: unknown, nest: number = 0): string => {
    if ("string" === typeof value) return JSON.stringify(value)
    if (isError(value)) return `${value.name}: ${value.message}`
    if (Array.isArray(value)) return `[${value.length && nest > 1 ? "..." : value.map(v => stringify(v, nest + 1))}]`

    // A null-prototype object, or one with a broken toString, throws out of
    // String(). Object.prototype.toString.call() never does.
    try {
        return String(value)
    } catch {
        return Object.prototype.toString.call(value)
    }
}

// minimum subset of https://github.com/kawanet/html-ele
export const $$ = (t: TemplateStringsArray, ...args: string[]): string => {
    let str = t[0]!
    for (let i = 1; i < t.length; i++) {
        str += escapeHTML(args[i - 1]!)
        str += t[i]!
    }
    return str
}

const AMP = {"<": "&lt;", "&": "&amp;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"} as const

const escapeHTML = (v: string): string => v?.replace(/([<&>"'])/g, $1 => AMP[$1 as keyof typeof AMP])
