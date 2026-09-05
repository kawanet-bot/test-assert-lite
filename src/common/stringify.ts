import {isError} from "./is-error.ts"
import {isTestRunnerError} from "./test-runner-error.ts"

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

// node:test wraps failures in ERR_TEST_FAILURE, while TAL only wraps values
// that are not already Errors. Both reporters should expose the same cause.
export const errorText = (error: unknown): string => {
    let inner = error
    if (isTestRunnerError(error)) {
        const {cause} = error
        inner = isError(cause) ? cause : error.message
    }
    if (isError(inner)) return inner.stack ?? `${inner.name}: ${inner.message}`
    return String(inner)
}
