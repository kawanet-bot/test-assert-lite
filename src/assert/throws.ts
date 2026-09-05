import type * as declared from "test-assert-lite"

import {isError} from "./../common/is-error.ts"

import {stringify} from "./../common/stringify.ts"
import {AssertionError} from "./assertion-error.ts"

// The second argument is a RegExp and nothing else. Anything else throws
// rather than being ignored, so the misuse is noticed.
export const throws = (block: () => unknown, expected?: declared.TAL.AssertPredicate, message?: string | Error): void => {
    // Calling a non-function raises a TypeError of its own, which reads as
    // the expected exception and passes. Reject it before running it, so a
    // test that asserts nothing cannot go green.
    if ("function" !== typeof block) {
        throw new TypeError("assert.throws() requires a function as the first argument")
    }

    if (expected != null && "function" !== typeof (expected as RegExp).test) {
        throw new TypeError("assert.throws() accepts a RegExp as the second argument")
    }

    let thrown: unknown
    let didThrow = false
    try {
        block()
    } catch (e) {
        thrown = e
        didThrow = true
    }

    if (!didThrow) {
        if (isError(message)) throw message
        throw new AssertionError({message: message ?? "expected to throw, did not", operator: "throws"})
    }

    if (expected == null) return

    const text = isError(thrown) ? thrown.message : String(thrown)
    if (expected.test(text)) return
    if (isError(message)) throw message
    throw new AssertionError({message: message ?? `thrown message ${stringify(text)} did not match ${expected}`, actual: text, expected, operator: "throws"})
}

// The second argument is either a RegExp filter or the message, folded the
// way node:assert folds it: a string or an Error is the message. An error
// class is not supported here, so it is rejected rather than swallowed as
// a message, which would print as "function TypeError() { [native code] }".
export const doesNotThrow = (block: () => unknown, expected?: declared.TAL.AssertPredicate | string | Error, message?: string | Error): void => {
    if ("function" !== typeof block) {
        throw new TypeError("assert.doesNotThrow() requires a function as the first argument")
    }

    const filtering = expected != null && "string" !== typeof expected && !(isError(expected))
    if (filtering && "function" !== typeof (expected as RegExp).test) {
        throw new TypeError("assert.doesNotThrow() accepts a RegExp as the second argument")
    }

    const filter = filtering ? expected as RegExp : undefined
    const note = filtering ? message : expected as string | Error | undefined

    let thrown: unknown
    let didThrow = false
    try {
        block()
    } catch (e) {
        thrown = e
        didThrow = true
    }

    if (!didThrow) return

    // Show the original message. Reporting only "it threw" is slower to act on.
    const text = isError(thrown) ? thrown.message : String(thrown)

    // What the filter does not match is not this assertion's concern, so it
    // passes through untouched.
    if (filter != null && !filter.test(text)) throw thrown

    if (isError(note)) throw note
    throw new AssertionError({message: note ?? `expected not to throw, got: ${text}`, actual: thrown, operator: "doesNotThrow"})
}
