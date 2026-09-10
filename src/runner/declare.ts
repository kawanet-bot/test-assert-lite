// The arguments a declaration takes, read the way node:test reads them:
// test(name, options, fn) with any of the three left out, and the skip and
// todo options that decide a test's fate before it runs. Shared by the
// registrar, which declares, and the test, which reads its own options.

import type * as declared from "test-assert-lite"

type TestOptions = declared.TAL.TestOptions

export type Args<F> = [name?: string | TestOptions | F, options?: TestOptions | F, fn?: F]

// Falls back to the function name, then to <anonymous>, as node:test does.
export const nameOf = (name: string | undefined, fn: Function | undefined): string =>
    name || fn?.name || "<anonymous>"

export const normalize = <F>(args: Args<F>): {name: string | undefined, options: TestOptions, fn: F | undefined} => {
    const [a, b, c] = args
    if ("string" === typeof a) {
        if ("function" === typeof b) return {name: a, options: {}, fn: b as F}
        return {name: a, options: (b as TestOptions) ?? {}, fn: c}
    }
    if ("function" === typeof a) return {name: undefined, options: {}, fn: a as F}
    return {name: undefined, options: (a as TestOptions) ?? {}, fn: (b as F) ?? c}
}

export const skipOf = (options: TestOptions): string | true | undefined => {
    const {skip} = options
    return skip === true || "string" === typeof skip ? skip : undefined
}

export const todoOf = (options: TestOptions): string | true | undefined => {
    const {todo} = options
    return todo === true || "string" === typeof todo ? todo : undefined
}
