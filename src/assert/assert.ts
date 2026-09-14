import type * as declared from "test-assert-lite"
import {isError} from "../utils/is-error.ts"
import {messageOf, stringify} from "../utils/stringify.ts"
import {AssertionError} from "./assertion-error.ts"
import {deepEqualPair} from "./deep-equal.ts"
import {equalPair} from "./equal.ts"
import {doesNotMatch, match} from "./match.ts"
import {doesNotReject, rejects} from "./rejects.ts"
import {doesNotThrow, throws} from "./throws.ts"

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

// The four assertions that come in a strict and a loose flavour; the
// strict ones also serve as the *StrictEqual names of both.
const flavour = (strict: boolean) => ({...equalPair(strict), ...deepEqualPair(strict)})

const fail: declared.TAL.Assert["fail"] = (message) => {
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? "Failed",
        operator: "fail",
    })
}

const ifError: declared.TAL.Assert["ifError"] = (value) => {
    if (value == null) return
    throw new AssertionError({
        message: `ifError got unwanted exception: ${messageOf(value)}`,
        actual: value, operator: "ifError",
    })
}

// The assertions hold no state, so they sit at module level and the factory
// only assembles them. Options such as a diff mode would enter here.
export interface AssertControl {
    // node's `assert`: equal / deepEqual are the loose ones.
    assert: declared.TAL.Assert
    // node's `assert.strict`: the same names, all strict.
    strict: declared.TAL.Assert
    methods: declared.TAL.AssertMethods
}

export const createAssert = (): AssertControl => {
    const strictOnly = flavour(true)
    const looseOnly = flavour(false)

    const shared = {
        fail,
        strictEqual: strictOnly.equal,
        notStrictEqual: strictOnly.notEqual,
        deepStrictEqual: strictOnly.deepEqual,
        notDeepStrictEqual: strictOnly.notDeepEqual,
        throws,
        doesNotThrow,
        rejects,
        doesNotReject,
        match,
        doesNotMatch,
    }

    // For t.assert, which in node:test carries the loose equal / deepEqual
    // like the plain assert. ok / ifError are plain checks here, not
    // assertion signatures.
    const methods: declared.TAL.AssertMethods = {...shared, ...looseOnly, ok, ifError}

    // The node:assert shape, where the module itself works as ok.
    const callable = (own: ReturnType<typeof flavour>): declared.TAL.Assert => Object.assign(
        ((value: unknown, message?: string | Error) => ok(value, message)) as declared.TAL.Assert,
        shared,
        own,
        {ok, ifError},
    )

    const strict = callable(strictOnly)
    const assert = callable(looseOnly)

    // As in node, `.strict` leads to the strict one from either.
    assert.strict = strict
    strict.strict = strict

    return {assert, strict, methods}
}
