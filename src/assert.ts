import type * as declared from "test-assert-lite"
import {AssertionError} from "./assert/assertion-error.ts"
import {deepEqual, notDeepEqual} from "./assert/deep-equal.ts"
import {doesNotThrow, throws} from "./assert/throws.ts"
import {isError} from "./common/is-error.ts"
import {stringify} from "./common/stringify.ts"

// An Error passed as the message is thrown as it is. node:assert applies
// that rule to every assertion, not only to fail().
const ok: declared.TAL.Assert["ok"] = (value, message) => {
    if (value) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `expected truthy, got ${stringify(value)}`,
        actual: value, expected: true, operator: "ok",
    })
}

// This is the strict flavour, so equal compares with Object.is: NaN equals
// NaN, and 0 differs from -0.
const equal = (actual: unknown, expected: unknown, message?: string | Error): void => {
    if (Object.is(actual, expected)) return
    if (isError(message)) throw message

    // Keep the values even when a message is given: without them there is
    // nothing to start from. node:assert does this for strictEqual alone.
    const detail = `expected ${stringify(expected)}, got ${stringify(actual)}`
    throw new AssertionError({
        message: message == null ? detail : `${message}\n\n${detail}`,
        actual, expected, operator: "strictEqual",
    })
}

const notEqual = (actual: unknown, expected: unknown, message?: string | Error): void => {
    if (!Object.is(actual, expected)) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `expected not ${stringify(expected)}`,
        actual, expected, operator: "notStrictEqual",
    })
}

const match = (value: string, regExp: RegExp, message?: string | Error): void => {
    if (regExp.test(value)) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `${stringify(value)} did not match ${regExp}`,
        actual: value, expected: regExp, operator: "match",
    })
}

const doesNotMatch = (value: string, regExp: RegExp, message?: string | Error): void => {
    if (!regExp.test(value)) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `${stringify(value)} matched ${regExp}`,
        actual: value, expected: regExp, operator: "doesNotMatch",
    })
}

// The assertions hold no state, so they sit at module level and the factory
// only assembles them. Options such as a diff mode would enter here.
export interface AssertControl {
    strict: declared.TAL.Assert
    methods: declared.TAL.AssertMethods
}

export const createAssert = (): AssertControl => {
    const base = {
        fail: (message?: string | Error): never => {
            if (isError(message)) throw message
            throw new AssertionError({
                message: message ?? "Failed",
                operator: "fail",
            })
        },
        equal,
        notEqual,
        deepEqual,
        notDeepEqual,
        strictEqual: equal,
        notStrictEqual: notEqual,
        deepStrictEqual: deepEqual,
        notDeepStrictEqual: notDeepEqual,
        throws,
        doesNotThrow,
        match,
        doesNotMatch,
    }

    const ifError = (value: unknown): void => {
        if (value == null) return
        throw new AssertionError({
            message: `ifError got unwanted exception: ${stringify(value)}`,
            actual: value, operator: "ifError",
        })
    }

    // For t.assert. Here ok / ifError are plain checks, not assertion signatures.
    const methods: declared.TAL.AssertMethods = {...base, ok, ifError}

    // The node:assert/strict shape, where the module itself works as ok.
    const strict: declared.TAL.Assert = Object.assign(
        ((value: unknown, message?: string | Error) => ok(value, message)) as declared.TAL.Assert,
        base,
        {ok, ifError: ifError as declared.TAL.Assert["ifError"]},
    )

    return {strict, methods}
}
