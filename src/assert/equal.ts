import type {TAL} from "test-assert-lite"
import {isError} from "../utils/is-error.ts"
import {stringify} from "../utils/stringify.ts"
import {AssertionError} from "./assertion-error.ts"
import {looseSame} from "./deep-equal.ts"

// Strict compares with Object.is: NaN equals NaN, and 0 differs from -0.
// Loose compares with ==, NaN still equal to itself, as node's equal does.
export const equalPair = (strict: boolean) => {
    const same = strict ? Object.is : looseSame

    const equal: TAL.Assert["equal"] = (actual, expected, message) => {
        if (same(actual, expected)) return
        if (isError(message)) throw message

        // Keep the values even when a message is given: without them there
        // is nothing to start from. node:assert does this for strictEqual alone.
        const detail = `expected ${stringify(expected)}, got ${stringify(actual)}`
        throw new AssertionError({
            message: message == null ? detail : `${message}\n\n${detail}`,
            actual, expected, operator: strict ? "strictEqual" : "equal",
        })
    }

    const notEqual: TAL.Assert["notEqual"] = (actual, expected, message) => {
        if (!same(actual, expected)) return
        if (isError(message)) throw message
        throw new AssertionError({
            message: message ?? `expected not ${stringify(expected)}`,
            actual, expected, operator: strict ? "notStrictEqual" : "notEqual",
        })
    }

    return {equal, notEqual}
}
