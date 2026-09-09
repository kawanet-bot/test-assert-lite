import type * as declared from "test-assert-lite"
import {isError} from "./is-error.ts"
import {stringify} from "./stringify.ts"

type FailureType = declared.TAL.FailureType

// https://github.com/nodejs/node/blob/main/lib/internal/errors.js
const ERR_TEST_FAILURE = "ERR_TEST_FAILURE"

// Carries the failures the runner produces itself, and any thrown value
// that is not an Error. An Error thrown by test code is reported as is, so
// fields such as AssertionError's actual and expected stay reachable.
// `code` matches node:test's own wrapper so a check written for it holds.
export class TesterError extends Error {
    readonly code = ERR_TEST_FAILURE
    readonly failureType: FailureType

    constructor(message: string, failureType: FailureType, cause?: unknown) {
        super(message, {cause})
        this.name = "TesterError"
        this.failureType = failureType
    }
}

// Keeps details.error an Error whatever the test threw.
export const testRunnerError = (thrown: unknown, failureType: FailureType): Error => {
    if (isError(thrown)) return thrown
    const message = "string" === typeof thrown ? thrown : stringify(thrown)
    return new TesterError(message, failureType, thrown)
}

export const isTesterError = (error: unknown): error is TesterError => (isError(error) && (error as declared.TAL.TesterError).code === ERR_TEST_FAILURE)

export const isSubtestsFailed = (error: unknown): boolean => isTesterError(error) && error.failureType === "subtestsFailed"

// V8 opens stack with "name: message"; JavaScriptCore and SpiderMonkey
// list the frames only, so the message has to be put back on top. The
// whole line is matched: a frames-only stack can open with a function
// whose name merely starts with the error's, such as ErrorHandler@.
const describeError = (error: Error): string => {
    const head = error.message ? `${error.name}: ${error.message}` : error.name
    const {stack} = error
    if (stack == null) return head
    return stack === head || stack.startsWith(`${head}\n`) ? stack : `${head}\n${stack}`
}

// node:test wraps failures in ERR_TEST_FAILURE, while TAL only wraps values
// that are not already Errors. Both reporters should expose the same cause.
export const errorText = (error: unknown): string => {
    let inner = error
    if (isTesterError(error)) {
        const {cause} = error
        inner = isError(cause) ? cause : error.message
    }
    return isError(inner) ? describeError(inner) : String(inner)
}

// The two verdicts a parent hands down, worded as node:test words them.
export const cancelledByParent = (): TesterError =>
    new TesterError("test did not finish before its parent and was cancelled", "cancelledByParent")

export const parentAlreadyFinished = (): TesterError =>
    new TesterError("test could not be started because its parent finished", "parentAlreadyFinished")
