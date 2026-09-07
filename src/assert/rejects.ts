import type * as declared from "test-assert-lite"
import {expectError, expectNoError, invalid, type Outcome, readExpectation, readFilter} from "./throws.ts"

type Predicate = declared.TAL.AssertPredicate
type Filter = declared.TAL.ErrorFilter
// The declared shape is node:assert's; at runtime a promise is what
// node:assert takes as one, checked below.
type Block = Promise<unknown> | (() => Promise<unknown>)

// An object carrying both then and catch, so a native Promise from any
// realm, but not a function that happens to carry them.
const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    value != null && "object" === typeof value &&
    "function" === typeof (value as {then?: unknown}).then && "function" === typeof (value as {catch?: unknown}).catch

// Runs the block, or takes the promise as given, and waits for how it
// settles, in the shape throws.ts judges. A function that throws before
// returning a promise is let through as it is rather than judged, as
// node:assert lets it; one that returns anything else is a misuse.
const settle = async (block: Block): Promise<Outcome> => {
    let promise: unknown
    if ("function" === typeof block) {
        promise = block()
        if (!isThenable(promise)) throw invalid()
    } else if (isThenable(block)) {
        promise = block
    } else {
        throw invalid()
    }
    try {
        await promise
        return null
    } catch (e) {
        return {thrown: e}
    }
}

// `rejects(block, [expected], [message])`: throws for a promise, judged by
// the same rules once it has settled. Being async, a misuse of the
// arguments is a rejection as well, as it is in node:assert.
export const rejects = async (block: Block, ...rest: [expected?: Predicate | string, message?: string | Error]): Promise<void> => {
    const caught = await settle(block)
    expectError(caught, readExpectation(rest), "rejects")
}

// `doesNotReject(block, [filter], [message])`: doesNotThrow for a promise.
// A rejection the filter does not match rejects this one as it is.
export const doesNotReject = async (block: Block, expected?: Filter | string, message?: string | Error): Promise<void> => {
    const caught = await settle(block)
    expectNoError(caught, readFilter(expected, message), "doesNotReject")
}
