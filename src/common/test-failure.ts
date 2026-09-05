import {isError} from "./is-error.ts"

type Failure = Error & {code?: string, failureType?: string, cause?: unknown}

// node:test wraps failures in ERR_TEST_FAILURE, while TAL only wraps values
// that are not already Errors. Both reporters should expose the same cause.
export const errorText = (error: unknown): string => {
    let inner = error
    if (isError(error) && (error as Failure).code === "ERR_TEST_FAILURE") {
        const {cause} = error as Failure
        inner = isError(cause) ? cause : error.message
    }
    if (isError(inner)) return inner.stack ?? `${inner.name}: ${inner.message}`
    return String(inner)
}

// A suite that failed only because a child did adds nothing to the failure
// list: the child's own entry already carries the useful error.
export const isSubtestsFailed = (error: unknown): boolean =>
    isError(error) && (error as Failure).failureType === "subtestsFailed"
