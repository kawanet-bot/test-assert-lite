import {isError} from "./../common/is-error.ts"
import {stringify} from "./../common/stringify.ts"
import {AssertionError} from "./assertion-error.ts"
import {isDataView, isTypedArray, sameArrayBuffer, sameDataView, sameTypedArray, typedArrayLength} from "./deep-equal-typed-arrays.ts"

const toTag = (v: object): string => Object.prototype.toString.call(v)

// --- kinds ---------------------------------------------------------------

// Every value is sorted into one kind before anything is compared, and
// both sides must land on the same one. A kind is settled by what cannot
// be imitated wherever possible: the internal slot an intrinsic reads
// (Date, RegExp, the wrappers, Map, Set, the buffers, URL), Array.isArray,
// ArrayBuffer.isView. The tag alone decides only where no such slot is
// reachable (Error, Arguments, a plain object).
type Kind =
    | "error" | "url" | "date" | "regexp" | "boolean" | "number" | "string" | "bigint"
    | "map" | "set" | "arraybuffer" | "sharedarraybuffer" | "dataview" | "typedarray"
    | "array" | "arguments" | "object" | "other"

type IsKind = (v: object, tag: string) => boolean

// An intrinsic works only on a receiver carrying the matching slot, and
// throws otherwise. It is asked only of a candidate - a same-realm
// instance (instanceof, so a masked tag cannot hide it) or one that shows
// the kind's tag (an instance from another realm) - so a plain object
// never pays for the throw.
const slotted = (ctor: Function | undefined, tag: string, intrinsic: (this: never) => unknown): IsKind => (v, seen) => {
    if (!((ctor != null && v instanceof ctor) || seen === tag)) return false
    try {
        intrinsic.call(v as never)
        return true
    } catch {
        return false
    }
}
const getter = (proto: object, name: string): (this: never) => unknown =>
    Object.getOwnPropertyDescriptor(proto, name)!.get as (this: never) => unknown
const absent = (): boolean => false

const regExpSource = getter(RegExp.prototype, "source")
const regExpFlags = getter(RegExp.prototype, "flags")

const isURL = "undefined" !== typeof URL ? slotted(URL, "[object URL]", getter(URL.prototype, "href")) : absent
const isDate = slotted(Date, "[object Date]", Date.prototype.getTime)
const isRegExp = slotted(RegExp, "[object RegExp]", regExpSource)
const isBooleanObject = slotted(Boolean, "[object Boolean]", Boolean.prototype.valueOf)
const isNumberObject = slotted(Number, "[object Number]", Number.prototype.valueOf)
const isStringObject = slotted(String, "[object String]", String.prototype.valueOf)
const isBigIntObject = "undefined" !== typeof BigInt ? slotted(BigInt, "[object BigInt]", BigInt.prototype.valueOf) : absent
const isMap = slotted(Map, "[object Map]", getter(Map.prototype, "size"))
const isSet = slotted(Set, "[object Set]", getter(Set.prototype, "size"))
const isArrayBuffer = slotted(ArrayBuffer, "[object ArrayBuffer]", getter(ArrayBuffer.prototype, "byteLength"))
const isSharedArrayBuffer = "undefined" !== typeof SharedArrayBuffer
    ? slotted(SharedArrayBuffer, "[object SharedArrayBuffer]", getter(SharedArrayBuffer.prototype, "byteLength"))
    : absent
const isArguments: IsKind = (_v, tag) => tag === "[object Arguments]"
const isPlainObject: IsKind = (_v, tag) => tag === "[object Object]"

// Order matters only where kinds overlap: an Error subclass carries the
// Error slot and nothing else, and ArrayBuffer.isView() answers for the
// typed arrays and DataView together before their brand tells them apart.
const kinds: [Kind, IsKind][] = [
    ["error", v => isError(v)],
    ["url", isURL],
    ["date", isDate],
    ["regexp", isRegExp],
    ["boolean", isBooleanObject],
    ["number", isNumberObject],
    ["string", isStringObject],
    ["bigint", isBigIntObject],
    ["map", isMap],
    ["set", isSet],
    ["arraybuffer", isArrayBuffer],
    ["sharedarraybuffer", isSharedArrayBuffer],
    ["dataview", v => ArrayBuffer.isView(v) && isDataView(v)],
    ["typedarray", v => ArrayBuffer.isView(v) && isTypedArray(v)],
    ["array", v => Array.isArray(v)],
    ["arguments", isArguments],
    ["object", isPlainObject],
]

// "other" is any kind this has no comparison for: WeakMap, Promise, a
// class instance with its own tag. Only a shared reference is equal then,
// which the identity check before the kinds already answered.
const kindOf = (v: object, tag: string): Kind => kinds.find(([, is]) => is(v, tag))?.[0] ?? "other"

// --- collections ---------------------------------------------------------

// Symbol keys are rare in practice, but cheap enough to walk alongside
// Object.keys() rather than carve out as a separate scope decision.
const ownKeys = (v: object, skip: number): PropertyKey[] =>
    [...Object.keys(v).slice(skip), ...Object.getOwnPropertySymbols(v).filter(s => Object.prototype.propertyIsEnumerable.call(v, s))]

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

const sameError = (a: Error, b: Error, memo: Memo): boolean => {
    const left = a as Error & {cause?: unknown, errors?: unknown}
    const right = b as Error & {cause?: unknown, errors?: unknown}
    if (left.name !== right.name || left.message !== right.message) return false
    if (("cause" in left) !== ("cause" in right)) return false
    if ("cause" in left && !isDeepEqual(left.cause, right.cause, memo)) return false
    // Checked by property name, not gated on AggregateError: node does
    // the same for any Error that happens to carry one.
    if (("errors" in left) !== ("errors" in right)) return false
    return !("errors" in left) || isDeepEqual(left.errors, right.errors, memo)
}

// --- the comparison ------------------------------------------------------

// Stamps each (left, right) pair by the order it was first entered. A
// revisit is equal only if the right side carries the same stamp - the
// same pairing, not merely a same-shaped cycle of a different period.
interface Memo {
    left: WeakMap<object, number>
    right: WeakMap<object, number>
    position: number
    strict: boolean
}

const isPrimitive = (v: unknown): boolean => v == null || "object" !== typeof v

// Two non-objects under the loose rules: ==, except that NaN equals
// itself, the way node's deepEqual (and its equal) treats it.
export const looseSame = (a: unknown, b: unknown): boolean => a == b || (Number.isNaN(a) && Number.isNaN(b))

// Strict is node's deepStrictEqual: Object.is for primitives, a shared
// prototype, own enumerable string and symbol keys. Loose is its deepEqual:
// == for primitives, the prototype ignored, symbol keys not walked. The
// kinds, Error fields, Date/RegExp/wrapper values and the key walk itself
// are shared by both.
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
    const kind = kindOf(a, tagA)
    if (kind !== kindOf(b, tagB) || kind === "other") return false

    // Stamped before recursing into anything below - including an Error's
    // cause chain - so a cycle reached through any path is still caught.
    // A revisit on either side alone is a cycle the other side lacks, so
    // it counts as a difference rather than being stamped afresh.
    const stamp = memo.left.get(a)
    if (stamp != null || memo.right.has(b)) return memo.right.get(b) === stamp
    const position = ++memo.position
    memo.left.set(a, position)
    memo.right.set(b, position)

    // Under strict, own enumerable symbol keys count like string keys, on a
    // typed array or a boxed primitive as much as on plain data. The one
    // exception is a builtin that exposes engine-internal state through
    // such a symbol (observed on URL, Node 18.x vs 24.x).
    let symbolAware = memo.strict

    // How many leading own keys the walk below may skip, once the kind's
    // own comparison has already covered what those keys stand for.
    let skip = 0

    try {
        if (kind === "error") {
            if (!sameError(a as Error, b as Error, memo)) return false
        } else if (kind === "url") {
            if ((a as URL).href !== (b as URL).href) return false
            symbolAware = false
        } else if (kind === "date") {
            // Read through the intrinsic: an own property of the same
            // name must not be able to fool the comparison.
            if (!Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b))) return false
        } else if (kind === "regexp") {
            // source and flags likewise. lastIndex is own but
            // non-enumerable, so it needs an explicit check of its own.
            if (regExpSource.call(a as never) !== regExpSource.call(b as never)) return false
            if (regExpFlags.call(a as never) !== regExpFlags.call(b as never)) return false
            if ((a as RegExp).lastIndex !== (b as RegExp).lastIndex) return false
        } else if (kind === "boolean") {
            if (!Object.is(Boolean.prototype.valueOf.call(a), Boolean.prototype.valueOf.call(b))) return false
        } else if (kind === "number") {
            if (!Object.is(Number.prototype.valueOf.call(a), Number.prototype.valueOf.call(b))) return false
        } else if (kind === "string") {
            // The one wrapper whose characters are already own
            // enumerable indices; still read through the intrinsic.
            if (String.prototype.valueOf.call(a) !== String.prototype.valueOf.call(b)) return false
        } else if (kind === "bigint") {
            if (!Object.is(BigInt.prototype.valueOf.call(a), BigInt.prototype.valueOf.call(b))) return false
        } else if (kind === "map") {
            if (!sameMap(a as Map<unknown, unknown>, b as Map<unknown, unknown>, memo)) return false
        } else if (kind === "set") {
            if (!sameSet(a as Set<unknown>, b as Set<unknown>, memo)) return false
        } else if (kind === "arraybuffer" || kind === "sharedarraybuffer") {
            if (!sameArrayBuffer(a as ArrayBufferLike, b as ArrayBufferLike)) return false
        } else if (kind === "dataview") {
            if (!sameDataView(a as DataView, b as DataView)) return false
        } else if (kind === "typedarray") {
            if (memo.strict) {
                if (!sameTypedArray(a as ArrayBufferView, b as ArrayBufferView)) return false
                // The indices are settled by the bytes, and Object.keys()
                // lists them first: only a property attached on top is left.
                skip = typedArrayLength.call(a as ArrayBufferView)
            } else if (typedArrayLength.call(a as ArrayBufferView) !== typedArrayLength.call(b as ArrayBufferView)) {
                // Loose compares the elements by value through the key
                // walk below, so +0 meets -0 and every NaN meets every other.
                return false
            }
        } else if (kind === "array" || kind === "arguments") {
            // length is not enumerable, so the walk below would miss it.
            if ((a as {length: unknown}).length !== (b as {length: unknown}).length) return false
        }

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

const newMemo = (strict: boolean): Memo => ({left: new WeakMap(), right: new WeakMap(), position: 0, strict})

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
