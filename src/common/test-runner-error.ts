import type * as declared from "test-assert-lite"
import {isError} from "./is-error.ts"
import {stringify} from "./stringify.ts"

type FailureType = declared.TAL.FailureType

const ERR_TEST_FAILURE = "ERR_TEST_FAILURE"

// Carries the failures the runner produces itself, and any thrown value
// that is not an Error. An Error thrown by test code is reported as is, so
// fields such as AssertionError's actual and expected stay reachable.
// `code` matches node:test's own wrapper so a check written for it holds.
export class TestRunnerError extends Error {
    readonly code = ERR_TEST_FAILURE
    readonly failureType: FailureType

    constructor(message: string, failureType: FailureType, cause?: unknown) {
        super(message, {cause})
        this.name = "TestRunnerError"
        this.failureType = failureType
    }
}

// Keeps details.error an Error whatever the test threw.
export const testRunnerError = (thrown: unknown, failureType: FailureType): Error => {
    if (isError(thrown)) return thrown
    const message = "string" === typeof thrown ? thrown : stringify(thrown)
    return new TestRunnerError(message, failureType, thrown)
}

export const isTestRunnerError = (error: unknown): error is TestRunnerError => (isError(error) && (error as declared.TAL.TestRunnerError).code === ERR_TEST_FAILURE)

export const isSubtestsFailed = (error: unknown): boolean => isTestRunnerError(error) && error.failureType === "subtestsFailed"
