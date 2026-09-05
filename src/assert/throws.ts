import type * as declared from "test-assert-lite"
import {isError} from "./../common/is-error.ts"
import {stringify} from "./../common/stringify.ts"
import {AssertionError} from "./assertion-error.ts"

type Predicate = declared.TAL.AssertPredicate

// The one error for a misuse of either assertion, whatever was wrong with
// the arguments. What matters is that it is not an AssertionError.
const invalid = (): TypeError => new TypeError("invalid arguments")

// Hands back what the block threw, wrapped so that a thrown undefined is
// still told apart from nothing thrown, as node:assert tells them apart.
const attempt = (block: () => unknown): {thrown: unknown} | null => {
    try {
        block()
        return null
    } catch (e) {
        return {thrown: e}
    }
}

const fail = (message: string | Error, operator: string, values?: {actual?: unknown, expected?: unknown}): never => {
    if (isError(message)) throw message
    throw new AssertionError({message, operator, ...values})
}

const isErrorClass = (fn: Function): boolean => fn === Error || Error.prototype.isPrototypeOf(fn.prototype)

// The properties an object matcher asks for. name and message come along
// when the object is itself an Error, where they are not enumerable.
const keysOf = (expected: object): string[] => isError(expected) ? [...Object.keys(expected), "name", "message"] : Object.keys(expected)

// A matcher shape node:assert takes. An object with nothing to compare
// would match anything, so it is refused as node:assert refuses it.
const isPredicate = (value: unknown): value is Predicate =>
    value instanceof RegExp || "function" === typeof value || ("object" === typeof value && value != null && keysOf(value).length > 0)

// Whether `thrown` satisfies `expected`, for every matcher node:assert takes:
// a RegExp against String(thrown), an Error class, a validation function,
// or an object whose properties thrown must carry.
const matches = (thrown: unknown, expected: Predicate): boolean => {
    if (expected instanceof RegExp) return expected.test(String(thrown))
    if ("function" === typeof expected) {
        if (isErrorClass(expected)) return thrown instanceof expected
        return (expected as (thrown: unknown) => boolean)(thrown) === true
    }
    if (thrown == null || "object" !== typeof thrown) return false

    const actual = thrown as Record<string, unknown>
    const wanted = expected as Record<string, unknown>
    return keysOf(expected).every(key => {
        if (!(key in actual)) return false
        const want = wanted[key]
        return want instanceof RegExp ? want.test(String(actual[key])) : Object.is(actual[key], want)
    })
}

// `throws(block, [expected], [message])`. As in node:assert a string in the
// second position is the message, and then a third argument is refused.
export const throws = (block: () => unknown, ...rest: [expected?: Predicate | string, message?: string | Error]): void => {
    if ("function" !== typeof block) throw invalid()

    const [second, third] = rest
    const messageOnly = "string" === typeof second
    if (messageOnly && rest.length > 1) throw invalid()
    const expected = messageOnly ? undefined : second as Predicate | undefined
    const message = messageOnly ? second as string : third
    if (expected != null && !isPredicate(expected)) throw invalid()

    const caught = attempt(block)
    if (caught == null) return fail(message ?? "expected to throw, did not", "throws")
    const {thrown} = caught

    // A message equal to what was thrown was meant as a matcher; node:assert
    // refuses the call as ambiguous rather than letting it pass. Any thrown
    // object is read by its message, not only an Error.
    const said = thrown != null && "object" === typeof thrown ? (thrown as {message?: unknown}).message : thrown
    if (messageOnly && said === message) throw invalid()

    if (expected != null && !matches(thrown, expected)) {
        fail(message ?? `${stringify(thrown)} did not match the expected error`, "throws", {actual: thrown, expected})
    }
}

// `doesNotThrow(block, [filter], [message])`. The filter is a RegExp or a
// function only; an exception it does not match is not this assertion's
// concern and passes through untouched.
export const doesNotThrow = (block: () => unknown, expected?: declared.TAL.ErrorFilter | string, message?: string | Error): void => {
    if ("function" !== typeof block) throw invalid()

    const messageOnly = "string" === typeof expected
    const filter = messageOnly ? undefined : expected as declared.TAL.ErrorFilter | undefined
    const note = messageOnly ? expected as string : message
    if (filter != null && !(filter instanceof RegExp || "function" === typeof filter)) throw invalid()

    const caught = attempt(block)
    if (caught == null) return
    const {thrown} = caught
    if (filter != null && !matches(thrown, filter)) throw thrown

    fail(note ?? `expected not to throw, got: ${stringify(thrown)}`, "doesNotThrow", {actual: thrown})
}
