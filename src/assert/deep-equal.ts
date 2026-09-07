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
    | "array" | "arguments" | "object"

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

// --- what each kind keeps outside its own enumerable properties ----------

// Answers false when that part differs, which settles the comparison.
// true means only that this part agrees: the walk over the own enumerable
// properties still follows for every kind, as it does in node, so a Date
// or a buffer with an extra property attached is still told apart.
type SameKind = (a: object, b: object, memo: Memo) => boolean

// Read through the intrinsics: an own property of the same name must not
// be able to fool the comparison.
const sameDate: SameKind = (a, b) => Object.is(Date.prototype.getTime.call(a as Date), Date.prototype.getTime.call(b as Date))

// lastIndex is own but non-enumerable, so it needs an explicit check.
const sameRegExp: SameKind = (a, b) =>
    regExpSource.call(a as never) === regExpSource.call(b as never) &&
    regExpFlags.call(a as never) === regExpFlags.call(b as never) &&
    (a as RegExp).lastIndex === (b as RegExp).lastIndex

// Boolean and Number wrap a primitive no own key exposes; String's
// characters are own enumerable indices already, so for it this only adds
// the value check the walk would not make on its own.
const sameWrapper = (valueOf: (this: never) => unknown): SameKind => (a, b) => Object.is(valueOf.call(a as never), valueOf.call(b as never))

const sameURL: SameKind = (a, b) => (a as URL).href === (b as URL).href

// has() (SameValueZero) clears out primitives and same-reference elements
// in O(1) each; only what still needs a real deep comparison - normally
// nothing, for a Set of primitives - reaches the O(n^2) match below.
const sameSet: SameKind = (a, b, memo) => {
    const left = a as Set<unknown>
    const right = b as Set<unknown>
    if (left.size !== right.size) return false
    const leftoverB = new Set(right)
    const leftoverA = [...left].filter(av => !leftoverB.delete(av))
    const remaining = [...leftoverB]
    return leftoverA.every(av => {
        const i = remaining.findIndex(bv => isDeepEqual(av, bv, memo))
        if (i < 0) return false
        remaining.splice(i, 1)
        return true
    })
}

const sameMap: SameKind = (a, b, memo) => {
    const left = a as Map<unknown, unknown>
    const right = b as Map<unknown, unknown>
    if (left.size !== right.size) return false
    const leftoverB = new Map(right)
    const leftoverA = [...left].filter(([ak, av]) => {
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

const sameError: SameKind = (a, b, memo) => {
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

const sameBuffer: SameKind = (a, b) => sameArrayBuffer(a as ArrayBufferLike, b as ArrayBufferLike)
const sameView: SameKind = (a, b) => sameDataView(a as DataView, b as DataView)
const sameBytes: SameKind = (a, b) => sameTypedArray(a as ArrayBufferView, b as ArrayBufferView)

// The loose typed array comparison: the elements are compared by value
// through the walk that follows, so +0 meets -0 and every NaN meets every
// other, and only the length is settled here - through the intrinsic, as
// the bytes are, so a subclass cannot report a length of its own.
const sameViewLength: SameKind = (a, b) => typedArrayLength.call(a as ArrayBufferView) === typedArrayLength.call(b as ArrayBufferView)

// length is not enumerable, so the walk would miss it.
const sameLength: SameKind = (a, b) => (a as {length: unknown}).length === (b as {length: unknown}).length

// --- the table -----------------------------------------------------------

// One row per kind: how it is recognised, then what it compares of its
// own under strict, then under loose. The loose column is written only
// where loose compares differently; otherwise the strict one serves both.
// A kind with nothing outside its own enumerable properties (a plain
// object) has no comparison of its own and goes straight to the walk.
type Row = [Kind, IsKind, SameKind?, SameKind?]

// Order matters only where kinds overlap: an Error subclass carries the
// Error slot and nothing else, and ArrayBuffer.isView() answers for the
// typed arrays and DataView together before their brand tells them apart.
const kinds: Row[] = [
    ["error", v => isError(v), sameError],
    ["url", isURL, sameURL],
    ["date", isDate, sameDate],
    ["regexp", isRegExp, sameRegExp],
    ["boolean", isBooleanObject, sameWrapper(Boolean.prototype.valueOf)],
    ["number", isNumberObject, sameWrapper(Number.prototype.valueOf)],
    ["string", isStringObject, sameWrapper(String.prototype.valueOf)],
    ["bigint", isBigIntObject, "undefined" !== typeof BigInt ? sameWrapper(BigInt.prototype.valueOf) : undefined],
    ["map", isMap, sameMap],
    ["set", isSet, sameSet],
    ["arraybuffer", isArrayBuffer, sameBuffer],
    ["sharedarraybuffer", isSharedArrayBuffer, sameBuffer],
    ["dataview", v => ArrayBuffer.isView(v) && isDataView(v), sameView],
    ["typedarray", v => ArrayBuffer.isView(v) && isTypedArray(v), sameBytes, sameViewLength],
    ["array", v => Array.isArray(v), sameLength],
    ["arguments", isArguments, sameLength],
    ["object", isPlainObject],
]

// No row is any kind this has no comparison for: WeakMap, Promise, a class
// instance with its own tag. Only a shared reference is equal then, which
// the identity check before the kinds already answered.
const rowOf = (v: object, tag: string): Row | undefined => kinds.find(([, is]) => is(v, tag))

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
    const row = rowOf(a, tagA)
    if (row == null) return false
    const [kind, , sameStrict, sameLoose] = row
    if (kind !== rowOf(b, tagB)?.[0]) return false
    const same = memo.strict ? sameStrict : sameLoose ?? sameStrict

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
        if (same != null && !same(a, b, memo)) return false

        // Under strict, own enumerable symbol keys count like string keys,
        // on a typed array or a boxed primitive as much as on plain data.
        // The one exception is a builtin that exposes engine-internal state
        // through such a symbol (observed on URL, Node 18.x vs 24.x).
        const symbolAware = memo.strict && kind !== "url"

        // A typed array's indices are settled by the bytes under strict, and
        // Object.keys() lists them first: only a property attached on top
        // is left to walk.
        const skip = kind === "typedarray" && memo.strict ? typedArrayLength.call(a as ArrayBufferView) : 0

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
