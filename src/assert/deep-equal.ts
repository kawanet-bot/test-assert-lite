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

const sameElements = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

// Byte-for-byte - exact for any binary content, unlike Object.is, which
// treats every NaN payload as the same value - for ArrayBuffer/DataView/
// typed array content. Any unaligned lead and tail (0-3 bytes each) are
// read one at a time; the aligned middle is read 4 at once as a Uint32,
// since a byte-by-byte pass alone cost ~45ms on a million-element buffer
// before comparing anything at all, just materializing the Uint8Array view.
// Both sides need the same 4-byte phase for a 32-bit read to ever land on
// both at once; when they don't, `lead` covers the whole range and `bulk`
// and `tail` both end up empty, falling back to byte-by-byte throughout.
const sameBytes = (a: ArrayBufferView, b: ArrayBufferView): boolean => {
    if (a.byteLength !== b.byteLength) return false
    const length = a.byteLength
    const phase = a.byteOffset % 4
    const lead = phase === b.byteOffset % 4 ? Math.min(length, (4 - phase) % 4) : length

    if (!sameElements(new Uint8Array(a.buffer, a.byteOffset, lead), new Uint8Array(b.buffer, b.byteOffset, lead))) {
        return false
    }

    const bulk = Math.floor((length - lead) / 4)
    if (bulk && !sameElements(
        new Uint32Array(a.buffer, a.byteOffset + lead, bulk),
        new Uint32Array(b.buffer, b.byteOffset + lead, bulk),
    )) return false

    const tailAt = lead + bulk * 4
    return sameElements(
        new Uint8Array(a.buffer, a.byteOffset + tailAt, length - tailAt),
        new Uint8Array(b.buffer, b.byteOffset + tailAt, length - tailAt),
    )
}

// Set/Map elements are unordered. has() (SameValueZero) first clears out
// primitives and same-reference objects in O(1) each, the way node does;
// only what's left - normally just object elements needing a real deep
// comparison - falls to the O(n^2) match-against-the-remainder below.
const sameSet = (a: Set<unknown>, b: Set<unknown>, memo: Memo): boolean => {
    if (a.size !== b.size) return false
    const leftoverB = new Set(b)
    const leftoverA = [...a].filter(av => !leftoverB.delete(av))
    const remaining = [...leftoverB]
    return leftoverA.every(av => {
        const i = remaining.findIndex(bv => isDeepEqual(av, bv, memo))
        if (i < 0) return false
        remaining.splice(i, 1)
        return true
    })
}

const sameMap = (a: Map<unknown, unknown>, b: Map<unknown, unknown>, memo: Memo): boolean => {
    if (a.size !== b.size) return false
    const leftoverB = new Map(b)
    const leftoverA = [...a].filter(([ak, av]) => {
        if (!leftoverB.has(ak) || !Object.is(leftoverB.get(ak), av)) return true
        leftoverB.delete(ak)
        return false
    })
    const remaining = [...leftoverB]
    return leftoverA.every(([ak, av]) => {
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
        } else if (a instanceof ArrayBuffer || tag === "[object SharedArrayBuffer]") {
            // By tag rather than instanceof SharedArrayBuffer: that global
            // may not exist in every environment, while nothing could ever
            // carry this tag there either, so the check stays safe as is.
            if (!sameBytes(new Uint8Array(a as ArrayBufferLike), new Uint8Array(b as ArrayBufferLike))) return false
        } else if (a instanceof DataView) {
            if (!sameBytes(a, b as DataView)) return false
        } else if (ArrayBuffer.isView(a)) {
            // Every typed array - integer or floating alike - compared by
            // raw bytes via the same sameBytes() as ArrayBuffer/DataView
            // above, matching node. Returned directly rather than falling
            // through to the own-key walk below: a custom own enumerable
            // property beyond the indices, not a realistic pattern for a
            // typed array, is the one thing this skips checking for that
            // the walk would have caught.
            return sameBytes(a as ArrayBufferView, b as ArrayBufferView)
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
