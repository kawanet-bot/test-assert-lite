import {isError} from "./../common/is-error.ts"
import {stringify} from "./../common/stringify.ts"
import {AssertionError} from "./assertion-error.ts"

const toTag = (v: object): string => Object.prototype.toString.call(v)

// Symbol-keyed own enumerable properties are rare in practice but cheap to
// include alongside Object.keys(), so both are walked the same way below.
const ownKeys = (v: object): PropertyKey[] =>
    [...Object.keys(v), ...Object.getOwnPropertySymbols(v).filter(s => Object.prototype.propertyIsEnumerable.call(v, s))]

// Arrays and Arguments objects expose their elements as own enumerable
// keys, so the key walk below still applies to them (typed arrays do too,
// but get their own faster path before this is ever consulted). Every
// other exotic tag not special-cased below (Promise, WeakMap, WeakSet, ...)
// keeps its real state in internal slots the walk cannot see, so it is
// only equal by reference - safer than a silent false "equal", and covers
// any future built-in the same way.
const isWalkable = (tag: string): boolean =>
    tag === "[object Object]" || tag === "[object Array]" || tag === "[object Arguments]"

// Byte-for-byte, for ArrayBuffer/DataView content.
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i])

// Set/Map elements are unordered, so each left-hand entry is matched against
// whichever right-hand entry (not yet claimed by an earlier one) it deep-
// equals; O(n^2), which is fine for the modest sizes this library sees.
const sameSet = (a: Set<unknown>, b: Set<unknown>, memo: Memo): boolean => {
    if (a.size !== b.size) return false
    const remaining = [...b]
    return [...a].every(av => {
        const i = remaining.findIndex(bv => isDeepEqual(av, bv, memo))
        if (i < 0) return false
        remaining.splice(i, 1)
        return true
    })
}

const sameMap = (a: Map<unknown, unknown>, b: Map<unknown, unknown>, memo: Memo): boolean => {
    if (a.size !== b.size) return false
    const remaining = [...b]
    return [...a].every(([ak, av]) => {
        const i = remaining.findIndex(([bk, bv]) => isDeepEqual(ak, bk, memo) && isDeepEqual(av, bv, memo))
        if (i < 0) return false
        remaining.splice(i, 1)
        return true
    })
}

// Tracks the (left, right) pairs currently on the recursion stack, each
// stamped with the order it was first entered. Revisiting a left value
// already on the stack is only equal if the right value carries the exact
// same stamp, i.e. it is the same pairing rather than a same-shaped cycle
// of a different period; a mismatch here is a real structural difference,
// not a cycle to break.
interface Memo {
    left: WeakMap<object, number>
    right: WeakMap<object, number>
    position: number
}

// Matches node's *strict* deepEqual: Object.is for primitives, a shared
// prototype and the same own enumerable keys (pairwise equal) for objects.
const isDeepEqual = (a: unknown, b: unknown, memo: Memo): boolean => {
    if (Object.is(a, b)) return true
    if (a == null || b == null || "object" !== typeof a || "object" !== typeof b) return false
    if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

    // A shared prototype alone is not enough: an Arguments object, a fake
    // array-like, or a plain object dressed up with a builtin's descriptors
    // can all share one. The internal tag catches what that check misses.
    const tag = toTag(a)
    const other = b as Record<string, unknown>
    if (tag !== toTag(b)) return false

    // Stamped before recursing into anything below - an Error's cause chain
    // included - so a cycle reached through any of those paths is still
    // caught, not only one reached through the own-key walk at the tail.
    const stamp = memo.left.get(a)
    if (stamp != null) return memo.right.get(b) === stamp
    const position = ++memo.position
    memo.left.set(a, position)
    memo.right.set(b, position)

    try {
        if (isError(a)) {
            const otherError = b as Error & {cause?: unknown, errors?: unknown}
            if (a.name !== otherError.name || a.message !== otherError.message) return false
            if (("cause" in a) !== ("cause" in otherError)) return false
            if ("cause" in a && !isDeepEqual((a as {cause?: unknown}).cause, otherError.cause, memo)) return false
            // Not gated on AggregateError specifically: node checks this own
            // property by name on any Error that happens to carry one.
            if (("errors" in a) !== ("errors" in otherError)) return false
            if ("errors" in a && !isDeepEqual((a as {errors?: unknown}).errors, otherError.errors, memo)) return false
        } else if ("undefined" !== typeof URL && a instanceof URL) {
            // href is not enumerable either, but a URL can still carry its own
            // extra enumerable properties, so this falls through to the walk too.
            if (a.href !== (b as URL).href) return false
        } else if (a instanceof Date) {
            // Called through the prototype, as with valueOf below: an own
            // property of the same name must not be able to fool it. Falls
            // through for any extra own enumerable property, as node does.
            if (!Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b))) return false
        } else if (a instanceof RegExp) {
            // lastIndex is own but non-enumerable, so - like getTime above -
            // it needs its own check; falls through for any extra own property.
            const otherRegExp = b as RegExp
            if (a.source !== otherRegExp.source || a.flags !== otherRegExp.flags || a.lastIndex !== otherRegExp.lastIndex) {
                return false
            }
        } else if (a instanceof Boolean) {
            if (!Object.is(Boolean.prototype.valueOf.call(a), Boolean.prototype.valueOf.call(b))) return false
        } else if (a instanceof Number) {
            if (!Object.is(Number.prototype.valueOf.call(a), Number.prototype.valueOf.call(b))) return false
            // String is the one wrapper whose characters are already own
            // enumerable indices; called through the prototype like the above,
            // so an own valueOf cannot fool it, and it still falls through
            // below for any extra own property.
        } else if (a instanceof String) {
            if (String.prototype.valueOf.call(a) !== String.prototype.valueOf.call(b)) return false
        } else if ("undefined" !== typeof BigInt && a instanceof BigInt) {
            if (!Object.is(BigInt.prototype.valueOf.call(a), BigInt.prototype.valueOf.call(b))) return false
        } else if (a instanceof Map) {
            if (!sameMap(a, b as Map<unknown, unknown>, memo)) return false
        } else if (a instanceof Set) {
            if (!sameSet(a, b as Set<unknown>, memo)) return false
        } else if (a instanceof ArrayBuffer) {
            if (!sameBytes(new Uint8Array(a), new Uint8Array(b as ArrayBuffer))) return false
        } else if (a instanceof DataView) {
            const otherView = b as DataView
            if (!sameBytes(
                new Uint8Array(a.buffer, a.byteOffset, a.byteLength),
                new Uint8Array(otherView.buffer, otherView.byteOffset, otherView.byteLength),
            )) return false
        } else if (ArrayBuffer.isView(a)) {
            // A direct indexed loop, numeric elements only: Object.keys()
            // would materialize one string per index before any of them
            // could be compared, which scales badly on a large buffer (the
            // kind msgpack-lite deals in) - measured at over 400ms for a
            // million elements against node's well under 1ms, and Object.keys()
            // alone (even without comparing anything) already costs ~45ms of
            // that. A custom own enumerable property beyond the indices - not
            // a realistic pattern for a typed array - is the one thing this
            // skips checking for that the general walk below would have caught.
            const typedA = a as unknown as ArrayLike<number>
            const typedB = other as unknown as ArrayLike<number>
            if (typedA.length !== typedB.length) return false
            for (let i = 0; i < typedA.length; i++) {
                if (!Object.is(typedA[i], typedB[i])) return false
            }
            return true
        } else if (!isWalkable(tag)) {
            return false
        }

        // length is never enumerable on these, so the own-key walk below would
        // not otherwise notice a stretched or shrunk one.
        if ((tag === "[object Array]" || tag === "[object Arguments]") && (a as {length: unknown}).length !== other.length) {
            return false
        }

        // Symbol keys are only walked for plain data (Object/Array/Arguments):
        // a builtin like URL can carry engine-internal symbol state that
        // differs across runtimes/versions (observed: Node's own URL exposes
        // enumerable internal symbols on 18.x, not on 24.x), which the
        // extra-property fallthrough above must not trip over.
        const symbolAware = isWalkable(tag)
        const keysA = symbolAware ? ownKeys(a) : Object.keys(a)
        const keysB = new Set(symbolAware ? ownKeys(b) : Object.keys(b))
        return keysA.length === keysB.size &&
            keysA.every(key => keysB.has(key) && isDeepEqual((a as Record<PropertyKey, unknown>)[key], (other as Record<PropertyKey, unknown>)[key], memo))
    } finally {
        memo.left.delete(a)
        memo.right.delete(b)
    }
}

const newMemo = (): Memo => ({left: new WeakMap(), right: new WeakMap(), position: 0})

export const deepEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
    if (isDeepEqual(actual, expected, newMemo())) return
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
    if (!isDeepEqual(actual, expected, newMemo())) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `expected not to deep-equal ${stringify(expected)}`,
        actual, expected, operator: "notDeepStrictEqual",
    })
}
