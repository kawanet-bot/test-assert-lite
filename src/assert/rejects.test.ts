import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {sharedTAL} from "../index.ts"

const TAL_strict = sharedTAL.assert.strict

const TITLE = "assert/rejects.test.ts"

const settled = async (promise: Promise<unknown>): Promise<unknown> => {
    try {
        await promise
        return undefined
    } catch (e) {
        return e
    }
}

const boom = async (): Promise<never> => {
    throw new RangeError("boom")
}

const fine = async (): Promise<number> => 1

describe(TITLE, () => {
    it("rejects passes on a rejection and fails on a fulfilment", async () => {
        await assert.doesNotReject(() => TAL_strict.rejects(boom))
        await assert.doesNotReject(() => TAL_strict.rejects(boom()))
        await assert.rejects(() => TAL_strict.rejects(fine), /expected to reject/)
        await assert.rejects(() => TAL_strict.rejects(fine()), /expected to reject/)
    })

    // A rejection with undefined is still a rejection, as node:assert counts it.
    it("both tell a rejection with undefined apart from a fulfilment", async () => {
        await assert.doesNotReject(() => TAL_strict.rejects(Promise.reject(undefined)))
        await assert.rejects(() => TAL_strict.doesNotReject(Promise.reject(null)), /expected not to reject/)
    })

    // The matchers are the ones throws takes, judged the same way.
    it("rejects matches a RegExp, an Error class, a validation function or an object", async () => {
        await assert.doesNotReject(() => TAL_strict.rejects(boom, /^RangeError: boom$/))
        await assert.rejects(() => TAL_strict.rejects(boom, /nope/), /did not match/)
        await assert.doesNotReject(() => TAL_strict.rejects(boom, RangeError))
        await assert.rejects(() => TAL_strict.rejects(boom, TypeError), /did not match/)

        // A class that does not extend Error matches by instanceof too.
        class Plain {}

        await assert.doesNotReject(() => TAL_strict.rejects(Promise.reject(new Plain()), Plain))
        await assert.rejects(() => TAL_strict.rejects(boom, Plain), TypeError)
        await assert.doesNotReject(() => TAL_strict.rejects(boom, (e: unknown) => e instanceof RangeError))
        await assert.rejects(() => TAL_strict.rejects(boom, () => false), /did not match/)
        await assert.doesNotReject(() => TAL_strict.rejects(boom, {message: "boom", name: "RangeError"}))
        await assert.rejects(() => TAL_strict.rejects(boom, {message: "other"}), /did not match/)
        await assert.doesNotReject(() => TAL_strict.rejects(boom, new RangeError("boom")))
        // A primitive rejection reason carries no properties to match.
        await assert.rejects(() => TAL_strict.rejects(Promise.reject(5), {code: "X"}), /did not match/)
    })

    // node:assert reads a string in the second position as the message, and
    // refuses one identical to the rejection's message as ambiguous.
    it("rejects takes a string second argument as the message, with the same limits as throws", async () => {
        const missing = await settled(TAL_strict.rejects(fine, "should have rejected")) as Error
        assert.equal(missing.name, "AssertionError")
        assert.equal(missing.message, "should have rejected")
        await assert.doesNotReject(() => TAL_strict.rejects(boom, "should have rejected"))
        await assert.rejects(TAL_strict.rejects(boom, "boom"), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects(boom, "one" as never, "two"), /invalid arguments/)
        await assert.doesNotReject(() => TAL_strict.rejects(boom, undefined, "boom"))
    })

    // node:assert takes an async function or a promise; a promise is an
    // object with both then and catch, from any realm, and a function that
    // returns anything else is a misuse. All of it rejects rather than throws.
    it("rejects refuses what node:assert refuses, as a rejection", async () => {
        // Every misuse ends in the same TypeError, which is what tells it apart from a failed assertion.
        await assert.rejects(TAL_strict.rejects("not a function" as never), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects(123 as never), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects(() => undefined as never), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects(() => new Map() as never), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects({then: () => undefined} as never), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects(boom, 123 as never), /invalid arguments/)
        await assert.rejects(TAL_strict.rejects(boom, {}), /invalid arguments/)
        // A function carrying then and catch is not a promise either.
        const thenableFn = Object.assign(() => undefined, {then: () => undefined, catch: () => undefined})
        await assert.rejects(TAL_strict.rejects(() => thenableFn as never), /invalid arguments/)
        // Nothing here throws synchronously.
        assert.doesNotThrow(() => void TAL_strict.rejects("x" as never).catch(() => undefined))
    })

    // The declared type is node's, a Promise; the runtime takes what node
    // takes at runtime, an object with then and catch, so this is cast.
    it("rejects takes a thenable with then and catch", async () => {
        const thenable = (settle: (ok: () => void, fail: (e: unknown) => void) => void): Promise<unknown> =>
            ({then: settle, catch: () => undefined}) as unknown as Promise<unknown>
        await assert.doesNotReject(() => TAL_strict.rejects(thenable((_ok, fail) => fail(new Error("later"))), /later/))
        await assert.doesNotReject(() => TAL_strict.doesNotReject(thenable(ok => ok())))
    })

    // Only the shape is asked, never a brand: a native Promise with catch
    // overwritten is a misuse here, a difference from node accepted
    // knowingly, since the block is the test's own promise and node's own
    // suite pins the shape rule alone. (Fulfilled, so nothing is left
    // rejected and unhandled by the refusal.)
    it("refuses a Promise whose catch was overwritten, on its shape alone", async () => {
        const without = Object.defineProperty(Promise.resolve(1), "catch", {value: undefined})
        await assert.rejects(TAL_strict.rejects(without, /x/), /invalid arguments/)
        await assert.rejects(TAL_strict.doesNotReject(without), /invalid arguments/)
    })

    // Likewise an object claiming the Promise tag is judged by its shape,
    // and a tag getter is never consulted, so it cannot inject an error.
    it("judges an object claiming the Promise tag by its shape, without reading the tag", async () => {
        const claiming = (extra: object): Promise<unknown> =>
            ({[Symbol.toStringTag]: "Promise", then: (_ok: unknown, fail: (e: unknown) => void) => fail(new Error("x")), ...extra}) as unknown as Promise<unknown>
        await assert.rejects(TAL_strict.rejects(claiming({}), /x/), /invalid arguments/)
        await assert.doesNotReject(() => TAL_strict.rejects(claiming({catch: () => undefined}), /x/))

        const injected = (): never => {
            throw new Error("injected")
        }
        const trapped = (extra: object): Promise<unknown> => Object.defineProperty(
            {then: (_ok: unknown, fail: (e: unknown) => void) => fail(new Error("x")), ...extra},
            Symbol.toStringTag,
            {get: injected},
        ) as unknown as Promise<unknown>
        await assert.rejects(TAL_strict.rejects(trapped({}), /x/), /invalid arguments/)
        await assert.doesNotReject(() => TAL_strict.rejects(trapped({catch: () => undefined}), /x/))
    })

    // A function that throws before it returns a promise has not rejected;
    // node:assert lets that error through untouched, and so does this.
    it("rejects lets a synchronous throw through as it is", async () => {
        const sentinel = new Error("sync")
        const error = await settled(TAL_strict.rejects(() => {
            throw sentinel
        }, {}))
        assert.equal(error, sentinel)
        assert.equal(await settled(TAL_strict.doesNotReject(() => {
            throw sentinel
        })), sentinel)
    })

    it("doesNotReject passes on a fulfilment and fails on a rejection", async () => {
        await assert.doesNotReject(() => TAL_strict.doesNotReject(fine))
        await assert.doesNotReject(() => TAL_strict.doesNotReject(fine()))
        // The original message is part of the failure, to be acted on directly.
        await assert.rejects(() => TAL_strict.doesNotReject(boom), /RangeError: boom/)
        await assert.rejects(() => TAL_strict.doesNotReject(boom, "note"), /note/)
    })

    // What the filter does not match is passed through, not swallowed.
    it("doesNotReject only reports what its filter matches", async () => {
        await assert.rejects(() => TAL_strict.doesNotReject(boom, /boom/), /expected not to reject/)
        await assert.rejects(() => TAL_strict.doesNotReject(boom, RangeError), /expected not to reject/)
        assert.ok(await settled(TAL_strict.doesNotReject(boom, /nope/)) instanceof RangeError)
        assert.ok(await settled(TAL_strict.doesNotReject(boom, TypeError)) instanceof RangeError)
    })

    it("doesNotReject refuses what node:assert refuses, as a rejection", async () => {
        await assert.rejects(TAL_strict.doesNotReject("not a function" as never), /invalid arguments/)
        await assert.rejects(TAL_strict.doesNotReject(() => new Map() as never), /invalid arguments/)
        await assert.rejects(TAL_strict.doesNotReject({then: () => undefined} as never), /invalid arguments/)
        await assert.rejects(TAL_strict.doesNotReject(boom, new Error("note") as never), /invalid arguments/)
        await assert.rejects(TAL_strict.doesNotReject(boom, {message: "boom"} as never), /invalid arguments/)
    })

    it("the failures name the rejects operators and carry the reason", async () => {
        const failed = await settled(TAL_strict.rejects(boom, /nope/)) as {operator?: string, actual?: unknown}
        assert.equal(failed.operator, "rejects")
        assert.ok(failed.actual instanceof RangeError)
        const unwanted = await settled(TAL_strict.doesNotReject(boom)) as {operator?: string, actual?: unknown}
        assert.equal(unwanted.operator, "doesNotReject")
        assert.ok(unwanted.actual instanceof RangeError)
        assert.equal((await settled(TAL_strict.rejects(fine)) as {operator?: string}).operator, "rejects")
    })

    it("an Error passed as message is thrown as is", async () => {
        const sentinel = new Error("sentinel")
        assert.equal(await settled(TAL_strict.rejects(fine, undefined, sentinel)), sentinel)
        assert.equal(await settled(TAL_strict.rejects(boom, /nope/, sentinel)), sentinel)
        assert.equal(await settled(TAL_strict.doesNotReject(boom, undefined, sentinel)), sentinel)
    })
})
