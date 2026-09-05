import {isError} from "./../common/is-error.ts"
import {stringify} from "./../common/stringify.ts"
import {AssertionError} from "./assertion-error.ts"

const hasOwn = Object.prototype.hasOwnProperty

// Map/Set/WeakMap/WeakSet/ArrayBuffer keep their real content outside of own
// enumerable properties (WeakMap/WeakSet cannot be introspected at all), so
// the key walk below would call any two instances equal regardless of it.
// Only an exact reference counts as equal for them.
const isOpaque = (v: object): boolean =>
    v instanceof Map || v instanceof Set || v instanceof WeakMap || v instanceof WeakSet || v instanceof ArrayBuffer

// Matches node's *strict* deepEqual: Object.is for primitives, a shared
// prototype and the same own enumerable keys (pairwise equal) for objects.
// `seen` pairs each left-hand object with the right-hand value it is already
// being compared against, so a revisited cycle is assumed equal.
const isDeepEqual = (a: unknown, b: unknown, seen: WeakMap<object, unknown>): boolean => {
    if (Object.is(a, b)) return true
    if (a == null || b == null || "object" !== typeof a || "object" !== typeof b) return false
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
    if (a instanceof Date) return a.getTime() === (b as Date).getTime()
    if (a instanceof RegExp) return a.source === (b as RegExp).source && a.flags === (b as RegExp).flags
    if (isOpaque(a)) return false
    if (Array.isArray(a) && a.length !== (b as unknown[]).length) return false

    // name/message are non-enumerable, so the own-key scan below would miss a
    // difference; stack is skipped on purpose, matching node's own behavior.
    if (isError(a) && (a.name !== (b as Error).name || a.message !== (b as Error).message)) return false

    if (seen.get(a) === b) return true
    seen.set(a, b)

    const keysA = Object.keys(a)
    const other = b as Record<string, unknown>
    return keysA.length === Object.keys(b).length &&
        keysA.every(key => hasOwn.call(b, key) && isDeepEqual((a as Record<string, unknown>)[key], other[key], seen))
}

export const deepEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
    if (isDeepEqual(actual, expected, new WeakMap())) return
    if (isError(message)) throw message

    // Keep the values even when a message is given, as equal() does: without
    // them there is nothing to start debugging from.
    const detail = `expected ${stringify(expected)} to deep-equal ${stringify(actual)}`
    throw new AssertionError({
        message: message == null ? detail : `${message}\n\n${detail}`,
        actual, expected, operator: "deepStrictEqual",
    })
}

export const notDeepEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
    if (!isDeepEqual(actual, expected, new WeakMap())) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `expected not to deep-equal ${stringify(expected)}`,
        actual, expected, operator: "notDeepStrictEqual",
    })
}
