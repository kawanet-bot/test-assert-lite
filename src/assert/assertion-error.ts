interface AssertionErrorOptions {
    message: string
    actual?: unknown
    expected?: unknown
    operator: string
}

// Carries a failure. Keeping actual / expected structured rather than only
// in the message leaves room for an HTML reporter to diff them later. The
// constructor stays out of the public declarations.
export class AssertionError extends Error {
    readonly code = "ERR_ASSERTION"
    readonly actual: unknown
    readonly expected: unknown
    readonly operator: string

    constructor(options: AssertionErrorOptions) {
        super(options.message)
        this.name = "AssertionError"
        this.actual = options.actual
        this.expected = options.expected
        this.operator = options.operator
    }
}
