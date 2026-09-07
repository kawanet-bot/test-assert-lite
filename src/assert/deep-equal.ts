import {isError} from "./../common/is-error.ts"
import {stringify} from "./../common/stringify.ts"
import {
    type DeepEqual,
    type Inspect,
    absent,
    getter,
    inspectArguments,
    inspectArray,
    inspectBigInt,
    inspectBoolean,
    inspectDate,
    inspectError,
    inspectNumber,
    inspectObject,
    inspectRegExp,
    inspectString,
    inspectURL,
    slotted,
} from "./../inspect/inspect.ts"
import {AssertionError} from "./assertion-error.ts"
import {isDataView, isTypedArray, sameArrayBuffer, sameDataView, sameTypedArray, typedArrayLength} from "./deep-equal-typed-arrays.ts"

const toTag = (v: object): string => Object.prototype.toString.call(v)

// --- kinds not yet in src/inspect/ ---------------------------------------

// has() (SameValueZero) clears out primitives and same-reference elements
// in O(1) each; only what still needs a real deep comparison - normally
// nothing, for a Set of primitives - reaches the O(n^2) match below.
const inspectSet: Inspect<Set<unknown>> = {
    is: slotted(Set, "[object Set]", getter(Set.prototype, "size")),
    eq: (left, right, deep) => {
        if (left.size !== right.size) return false
        const leftoverB = new Set(right)
        const leftoverA = [...left].filter(av => !leftoverB.delete(av))
        const remaining = [...leftoverB]
        return leftoverA.every(av => {
            const i = remaining.findIndex(bv => deep(av, bv))
            if (i < 0) return false
            remaining.splice(i, 1)
            return true
        })
    },
}

const inspectMap: Inspect<Map<unknown, unknown>> = {
    is: slotted(Map, "[object Map]", getter(Map.prototype, "size")),
    eq: (left, right, deep) => {
        if (left.size !== right.size) return false
        const leftoverB = new Map(right)
        const leftoverA = [...left].filter(([ak, av]) => {
            if (!leftoverB.has(ak) || !Object.is(leftoverB.get(ak), av)) return true
            leftoverB.delete(ak)
            return false
        })
        const remaining = [...leftoverB]
        return leftoverA.every(([ak, av]) => {
            const i = remaining.findIndex(([bk, bv]) => deep(ak, bk) && deep(av, bv))
            if (i < 0) return false
            remaining.splice(i, 1)
            return true
        })
    },
}

const inspectArrayBuffer: Inspect<ArrayBuffer> = {
    is: slotted(ArrayBuffer, "[object ArrayBuffer]", getter(ArrayBuffer.prototype, "byteLength")),
    eq: sameArrayBuffer,
}

const inspectSharedArrayBuffer: Inspect<SharedArrayBuffer> = {
    is: "undefined" !== typeof SharedArrayBuffer
        ? slotted(SharedArrayBuffer, "[object SharedArrayBuffer]", getter(SharedArrayBuffer.prototype, "byteLength"))
        : absent(),
    eq: sameArrayBuffer,
}

const inspectDataView: Inspect<DataView> = {
    is: isDataView,
    eq: sameDataView,
}

// The loose typed array comparison: the elements are compared by value
// through the walk that follows, so +0 meets -0 and every NaN meets every
// other, and only the length is settled here - through the intrinsic, as
// the bytes are, so a subclass cannot report a length of its own.
const inspectArrayBufferView: Inspect<ArrayBufferView> = {
    is: isTypedArray,
    eq: sameTypedArray,
    loose: (a, b) => typedArrayLength.call(a) === typedArrayLength.call(b),
}

// --- the table -----------------------------------------------------------

// Every value is sorted into one kind before anything is compared, and
// both sides must land on the same one. Order matters only where kinds
// overlap: an Error subclass carries the Error slot and nothing else.
const kinds: Inspect<object>[] = [
    inspectError,
    inspectURL,
    inspectDate,
    inspectRegExp,
    inspectBoolean,
    inspectNumber,
    inspectString,
    inspectBigInt,
    inspectMap,
    inspectSet,
    inspectArrayBuffer,
    inspectSharedArrayBuffer,
    inspectDataView,
    inspectArrayBufferView,
    inspectArray,
    inspectArguments,
    inspectObject,
]

// No kind is any value this has no comparison for: WeakMap, Promise, a
// class instance with its own tag. Only a shared reference is equal then,
// which the identity check before the kinds already answered.
const inspectOf = (v: object, tag: string): Inspect<object> | undefined => kinds.find(kind => kind.is(v, tag))

// --- the comparison ------------------------------------------------------

// Symbol keys are rare in practice, but cheap enough to walk alongside
// Object.keys() rather than carve out as a separate scope decision.
const ownKeys = (v: object, skip: number): PropertyKey[] =>
    [...Object.keys(v).slice(skip), ...Object.getOwnPropertySymbols(v).filter(s => Object.prototype.propertyIsEnumerable.call(v, s))]

// Stamps each (left, right) pair by the order it was first entered. A
// revisit is equal only if the right side carries the same stamp - the
// same pairing, not merely a same-shaped cycle of a different period.
interface Memo {
    left: WeakMap<object, number>
    right: WeakMap<object, number>
    position: number
    strict: boolean
    deep: DeepEqual
}

const isPrimitive = (v: unknown): boolean => v == null || "object" !== typeof v

// Two non-objects under the loose rules: ==, except that NaN equals
// itself, the way node's deepEqual (and its equal) treats it.
export const looseSame = (a: unknown, b: unknown): boolean => a == b || (Number.isNaN(a) && Number.isNaN(b))

// Strict is node's deepStrictEqual: Object.is for primitives, a shared
// prototype, own enumerable string and symbol keys. Loose is its deepEqual:
// == for primitives, the prototype ignored, symbol keys not walked. The
// kinds, what each kind compares of its own, and the key walk itself are
// shared by both.
const isDeepEqual = (a: unknown, b: unknown, memo: Memo): boolean => {
    if (Object.is(a, b)) return true
    if (a == null || b == null || "object" !== typeof a || "object" !== typeof b) {
        // An object never loosely equals a primitive either.
        return !memo.strict && isPrimitive(a) && isPrimitive(b) && looseSame(a, b)
    }
    if (memo.strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

    // The tag first, as node does: it separates an Arguments object from
    // a plain object, or a lookalike from a real array, whatever their
    // prototypes. Then the kind, which each side settles for itself.
    const tagA = toTag(a)
    const tagB = toTag(b)
    if (tagA !== tagB) return false
    const kind = inspectOf(a, tagA)
    if (kind == null || kind !== inspectOf(b, tagB)) return false
    const same = memo.strict || kind.loose == null ? kind.eq : kind.loose

    // Stamped before recursing into anything below - including an Error's
    // cause chain - so a cycle reached through any path is still caught.
    // A revisit on either side alone is a cycle the other side lacks, so
    // it counts as a difference rather than being stamped afresh.
    const stamp = memo.left.get(a)
    if (stamp != null || memo.right.has(b)) return memo.right.get(b) === stamp
    const position = ++memo.position
    memo.left.set(a, position)
    memo.right.set(b, position)

    try {
        if (false === same(a, b, memo.deep)) return false

        // Under strict, own enumerable symbol keys count like string keys,
        // on a typed array or a boxed primitive as much as on plain data.
        // The one exception is a builtin that exposes engine-internal state
        // through such a symbol (observed on URL, Node 18.x vs 24.x).
        const symbolAware = memo.strict && kind !== inspectURL

        // A typed array's indices are settled by the bytes under strict, and
        // Object.keys() lists them first: only a property attached on top
        // is left to walk.
        const skip = kind === inspectArrayBufferView && memo.strict ? typedArrayLength.call(a as ArrayBufferView) : 0

        const other = b as Record<PropertyKey, unknown>
        const keysA = symbolAware ? ownKeys(a, skip) : Object.keys(a).slice(skip)
        const keysB = new Set(symbolAware ? ownKeys(b, skip) : Object.keys(b).slice(skip))
        return keysA.length === keysB.size &&
            keysA.every(key => keysB.has(key) && isDeepEqual((a as Record<PropertyKey, unknown>)[key], other[key], memo))
    } finally {
        memo.left.delete(a)
        memo.right.delete(b)
    }
}

const newMemo = (strict: boolean): Memo => {
    const memo: Memo = {left: new WeakMap(), right: new WeakMap(), position: 0, strict, deep: (a, b) => isDeepEqual(a, b, memo)}
    return memo
}

type DeepAssertion = (actual: unknown, expected: unknown, message?: string | Error) => void

// The flag is fixed here rather than taken per call, since node's own
// signatures have no room for it: one pair serves as deepStrictEqual /
// notDeepStrictEqual, the other as the loose deepEqual / notDeepEqual.
export const deepEqualPair = (strict: boolean): {deepEqual: DeepAssertion, notDeepEqual: DeepAssertion} => {
    const deepEqual: DeepAssertion = (actual, expected, message) => {
        if (isDeepEqual(actual, expected, newMemo(strict))) return
        if (isError(message)) throw message

        // Keep the values even when a message is given: without them there
        // is nothing to start debugging from.
        const detail = `expected ${stringify(expected)} to deep-equal ${stringify(actual)}`
        throw new AssertionError({
            message: message == null ? detail : `${message}\n\n${detail}`,
            actual, expected, operator: strict ? "deepStrictEqual" : "deepEqual",
        })
    }

    const notDeepEqual: DeepAssertion = (actual, expected, message) => {
        if (!isDeepEqual(actual, expected, newMemo(strict))) return
        if (isError(message)) throw message
        throw new AssertionError({
            message: message ?? `expected not to deep-equal ${stringify(expected)}`,
            actual, expected, operator: strict ? "notDeepStrictEqual" : "notDeepEqual",
        })
    }

    return {deepEqual, notDeepEqual}
}
