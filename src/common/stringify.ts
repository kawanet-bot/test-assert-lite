import {isError} from "./is-error.ts"

// Render a value as one readable line. Arrays expand two levels deep and
// fold to "..." below that, since recursing without a limit overflows on a
// circular reference. The marker keeps an elision from reading as real
// data, and an empty array is never folded for the same reason.
export const stringify = (value: unknown, nest: number = 0): string => {
    if ("string" === typeof value) return JSON.stringify(value)
    if (isError(value)) return `${value.name}: ${value.message}`
    if (Array.isArray(value)) return `[${value.length && nest > 1 ? "..." : value.map(v => stringify(v, nest + 1))}]`
    return String(value)
}
