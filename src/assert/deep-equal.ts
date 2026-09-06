import {isError} from "./../common/is-error.ts"
import {stringify} from "./../common/stringify.ts"
import {AssertionError} from "./assertion-error.ts"

const toTag = (v: object): string => Object.prototype.toString.call(v)

// Symbol keys are rare in practice, but cheap enough to walk alongside
// Object.keys() rather than carve out as a separate scope decision.
const ownKeys = (v: object): PropertyKey[] =>
    [...Object.keys(v), ...Object.getOwnPropertySymbols(v).filter(s => Object.prototype.propertyIsEnumerable.call(v, s))]

// Array/Arguments elements are own enumerable keys, so the walk below
// applies to them too (typed arrays take their own path first). Anything
// else defaults to reference-only equality - a false "equal" would be
// worse than that for a type this has no specific handling for.
const isWalkable = (tag: string): boolean =>
    tag === "[object Object]" || tag === "[object Array]" || tag === "[object Arguments]"

const sameElements = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

interface ByteRange {
    buffer: ArrayBufferLike
    byteOffset: number
    byteLength: number
}

// Read through the intrinsic accessor rather than a's own byteLength/
// byteOffset/buffer: a DataView or typed array subclass could otherwise
// override one of those to make sameBytes() below see the wrong range.
const byteRangeOf = (proto: object) => {
    const byteLength = Object.getOwnPropertyDescriptor(proto, "byteLength")!.get as (this: object) => number
    const byteOffset = Object.getOwnPropertyDescriptor(proto, "byteOffset")!.get as (this: object) => number
    const buffer = Object.getOwnPropertyDescriptor(proto, "buffer")!.get as (this: object) => ArrayBufferLike
    return (v: object): ByteRange => ({buffer: buffer.call(v), byteOffset: byteOffset.call(v), byteLength: byteLength.call(v)})
}

const dataViewRange = byteRangeOf(DataView.prototype)
const typedArrayRange = byteRangeOf(Object.getPrototypeOf(Uint8Array.prototype) as object)

// Exact for any binary content, unlike Object.is, which treats every NaN
// payload as the same value. Falls back to comparing every byte when the
// two sides don't share a 4-byte alignment phase, since no 32-bit read
// could then land on both at once.
const sameBytes = (a: ByteRange, b: ByteRange): boolean => {
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

// has() (SameValueZero) clears out primitives and same-reference elements
// in O(1) each; only what still needs a real deep comparison - normally
// nothing, for a Set of primitives - reaches the O(n^2) match below.
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

// Stamps each (left, right) pair by the order it was first entered. A
// revisit is equal only if the right side carries the same stamp - the
// same pairing, not merely a same-shaped cycle of a different period.
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

    // A shared prototype alone is not enough: an Arguments object or a fake
    // array-like can share one with a plain object or a real array. The
    // internal tag catches what the prototype check misses.
    const tag = toTag(a)
    const other = b as Record<string, unknown>
    if (tag !== toTag(b)) return false

    // Stamped before recursing into anything below - including an Error's
    // cause chain - so a cycle reached through any path is still caught.
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
            // Checked by property name, not gated on AggregateError: node
            // does the same for any Error that happens to carry one.
            if (("errors" in a) !== ("errors" in otherError)) return false
            if ("errors" in a && !isDeepEqual((a as {errors?: unknown}).errors, otherError.errors, memo)) return false
        } else if ("undefined" !== typeof URL && a instanceof URL) {
            if (a.href !== (b as URL).href) return false
        } else if (a instanceof Date) {
            // Called through the prototype: an own property of the same
            // name must not be able to fool the comparison.
            if (!Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b))) return false
        } else if (a instanceof RegExp) {
            // lastIndex is own but non-enumerable, so - like getTime above -
            // it needs an explicit check of its own.
            const otherRegExp = b as RegExp
            if (a.source !== otherRegExp.source || a.flags !== otherRegExp.flags || a.lastIndex !== otherRegExp.lastIndex) {
                return false
            }
        } else if (a instanceof Boolean) {
            if (!Object.is(Boolean.prototype.valueOf.call(a), Boolean.prototype.valueOf.call(b))) return false
        } else if (a instanceof Number) {
            if (!Object.is(Number.prototype.valueOf.call(a), Number.prototype.valueOf.call(b))) return false
        } else if (a instanceof String) {
            // The one wrapper whose characters are already own enumerable
            // indices; still called through the prototype like the above.
            if (String.prototype.valueOf.call(a) !== String.prototype.valueOf.call(b)) return false
        } else if ("undefined" !== typeof BigInt && a instanceof BigInt) {
            if (!Object.is(BigInt.prototype.valueOf.call(a), BigInt.prototype.valueOf.call(b))) return false
        } else if (a instanceof Map) {
            if (!sameMap(a, b as Map<unknown, unknown>, memo)) return false
        } else if (a instanceof Set) {
            if (!sameSet(a, b as Set<unknown>, memo)) return false
        } else if (a instanceof ArrayBuffer || tag === "[object SharedArrayBuffer]") {
            // Tag rather than instanceof SharedArrayBuffer: that global may
            // not exist in every environment, while nothing could carry
            // this tag there either, so the check is safe either way.
            if (!sameBytes(typedArrayRange(new Uint8Array(a as ArrayBufferLike)), typedArrayRange(new Uint8Array(b as ArrayBufferLike)))) {
                return false
            }
        } else if (tag === "[object DataView]") {
            // Tag rather than instanceof DataView: a cross-realm DataView
            // (e.g. from an iframe or vm context) fails that check while
            // still reaching this branch via ArrayBuffer.isView() below.
            if (!sameBytes(dataViewRange(a as DataView), dataViewRange(b as DataView))) return false
        } else if (ArrayBuffer.isView(a)) {
            // Returned directly rather than falling through to the own-key
            // walk below: a typed array's own properties beyond its indices
            // are not checked, unlike ArrayBuffer/DataView above.
            return sameBytes(typedArrayRange(a as ArrayBufferView), typedArrayRange(b as ArrayBufferView))
        } else if (!isWalkable(tag)) {
            return false
        }

        // length is not enumerable, so the walk below would miss it.
        if ((tag === "[object Array]" || tag === "[object Arguments]") && (a as {length: unknown}).length !== other.length) {
            return false
        }

        // Symbol keys are walked only for plain data: a builtin can carry
        // engine-internal symbol state (observed on URL, Node 18.x vs
        // 24.x) that must not be mistaken for a real difference.
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

    // Keep the values even when a message is given: without them there is
    // nothing to start debugging from.
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
