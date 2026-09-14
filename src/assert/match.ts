import type * as declared from "test-assert-lite"
import {isError} from "../utils/is-error.ts"
import {stringify} from "../utils/stringify.ts"
import {AssertionError} from "./assertion-error.ts"

export const match: declared.TAL.Assert["match"] = (value, regExp, message) => {
    if (regExp.test(value)) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `${stringify(value)} did not match ${regExp}`,
        actual: value, expected: regExp, operator: "match",
    })
}

export const doesNotMatch: declared.TAL.Assert["doesNotMatch"] = (value, regExp, message) => {
    if (!regExp.test(value)) return
    if (isError(message)) throw message
    throw new AssertionError({
        message: message ?? `${stringify(value)} matched ${regExp}`,
        actual: value, expected: regExp, operator: "doesNotMatch",
    })
}
