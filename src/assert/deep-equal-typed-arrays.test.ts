import {strict as assert} from "node:assert"
import {describe, it} from "node:test"
import {strict as TAL} from "./../index.ts"

const TITLE = "assert/deep-equal-typed-arrays.test.ts"

describe(TITLE, () => {
    // Every typed array is compared by its raw bytes (see the alignment
    // tests below), which happens to also expose its elements as own
    // enumerable indices for an integer type, same as a plain array's.
    it("compares typed arrays element by element", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])))
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])), /deep-equal/)
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]), new Int8Array([1, 2])), /deep-equal/)
    })

    // Deliberate trade-off for large-buffer performance: returning directly
    // from the byte comparison skips the own-key walk entirely, so a custom
    // own enumerable property added on top of a typed array's indices - not
    // a realistic pattern for one - goes unnoticed, unlike a plain array's would.
    it("does not notice an extra own property on a typed array (documented trade-off)", () => {
        const withExtra = Object.assign(new Uint8Array([1, 2]), {tag: 1})
        assert.doesNotThrow(() => TAL.deepEqual(withExtra, new Uint8Array([1, 2])))
    })

    // Object.is(NaN, NaN) is always true regardless of payload bits, but a
    // byte comparison tells two different NaN encodings apart - the reason
    // typed arrays are compared by bytes rather than by element value.
    it("distinguishes different NaN bit patterns in a floating typed array", () => {
        const nanBits = (bits: number): Float32Array => {
            const buf = new ArrayBuffer(4)
            new DataView(buf).setUint32(0, bits, true)
            return new Float32Array(buf)
        }
        const a = nanBits(0x7fc00000)
        const b = nanBits(0x7fc00000)
        const c = nanBits(0x7fc00001)
        assert.ok(Number.isNaN(a[0]) && Number.isNaN(c[0]))
        assert.doesNotThrow(() => TAL.deepEqual(a, b))
        assert.throws(() => TAL.deepEqual(a, c), /deep-equal/)
    })

    // byteLength/byteOffset/buffer are read through the intrinsic
    // accessor, not as an own property lookup: a subclass overriding one
    // must not be able to make this see the wrong bytes, or none at all.
    it("resists a subclass overriding byteLength/byteOffset/buffer", () => {
        class Hidden extends Uint8Array {
            get byteLength(): number {
                return 0
            }
        }
        const a = new Hidden([1, 2, 3])
        const b = new Hidden([9, 9, 9])
        assert.throws(() => TAL.deepEqual(a, b), /deep-equal/)
    })

    // ArrayBuffer/DataView compare their bytes, a DataView windowed by its
    // own byteOffset/byteLength rather than its whole backing buffer's.
    it("compares ArrayBuffer/DataView by byte content", () => {
        assert.doesNotThrow(() => TAL.deepEqual(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer))
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer), /deep-equal/)

        const view = (bytes: number[], offset: number, length: number): DataView =>
            new DataView(new Uint8Array(bytes).buffer, offset, length)
        assert.doesNotThrow(() => TAL.deepEqual(view([0, 1, 2, 3], 1, 2), view([9, 1, 2, 9], 1, 2)))
        assert.throws(() => TAL.deepEqual(view([0, 1, 2, 3], 1, 2), view([0, 1, 9, 3], 1, 2)), /deep-equal/)
    })

    // A DataView from another realm (an iframe, a vm context) fails
    // `instanceof DataView` here while still reaching this library's
    // `ArrayBuffer.isView()` branch; simulated by swapping the prototype
    // rather than an actual vm context, which a browser run has no access to.
    it("compares a DataView that fails instanceof DataView (e.g. cross-realm)", () => {
        // One shared prototype, the way a real foreign realm has exactly one
        // DataView.prototype of its own - two different plain objects here
        // would fail the prototype-equality check for an unrelated reason.
        const foreignProto = {[Symbol.toStringTag]: "DataView"}
        const foreign = (bytes: number[]): DataView =>
            Object.setPrototypeOf(new DataView(new Uint8Array(bytes).buffer), foreignProto)
        assert.equal(foreign([1]) instanceof DataView, false)
        assert.doesNotThrow(() => TAL.deepEqual(foreign([1, 2, 3]), foreign([1, 2, 3])))
        assert.throws(() => TAL.deepEqual(foreign([1, 2, 3]), foreign([9, 9, 9])), /deep-equal/)
    })

    // A typed array can also spoof Symbol.toStringTag to claim it is a
    // DataView; the tag alone cannot tell real DataViews apart from this,
    // so the two must not be routed to the DataView-only intrinsics.
    it("is not fooled by a typed array spoofing the DataView tag", () => {
        const fake = (bytes: number[]): Uint8Array =>
            Object.defineProperty(new Uint8Array(bytes), Symbol.toStringTag, {get: () => "DataView", configurable: true})
        assert.equal(Object.prototype.toString.call(fake([])), "[object DataView]")
        assert.doesNotThrow(() => TAL.deepEqual(fake([1, 2, 3]), fake([1, 2, 3])))
        assert.throws(() => TAL.deepEqual(fake([1, 2, 3]), fake([9, 9, 9])), /deep-equal/)
    })

    // Same prototype (so the earlier prototype check passes) plus a spoofed
    // own tag (so the tag check passes too) still lacks the internal slots
    // typedArray.read() needs, so the brand check must reject it too.
    it("is not fooled by a plain object spoofing the Uint8Array tag", () => {
        const fake = Object.create(Uint8Array.prototype) as object
        Object.defineProperty(fake, Symbol.toStringTag, {value: "Uint8Array", configurable: true})
        assert.equal(Object.getPrototypeOf(fake), Uint8Array.prototype)
        assert.equal(Object.prototype.toString.call(fake), "[object Uint8Array]")
        assert.throws(() => TAL.deepEqual(new Uint8Array([1, 2, 3]), fake), /deep-equal/)
    })

    // The byte comparison splits off any unaligned lead and tail (0-3 bytes
    // each) and reads the aligned middle 4 bytes at once; this exercises
    // every offset phase and enough lengths to cover a lead-only range, a
    // lead+bulk+tail range, and a difference landing in each of the three.
    it("compares byte content correctly at every lead/bulk/tail alignment", () => {
        const view = (bytes: number[], offset: number, length: number): DataView =>
            new DataView(new Uint8Array(bytes).buffer, offset, length)
        const bytes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

        // Every offset phase (0-3), a length spanning lead + a full 4-byte
        // word + tail, with a difference planted in the lead and the tail.
        for (let offset = 0; offset < 4; offset++) {
            assert.doesNotThrow(() => TAL.deepEqual(view(bytes, offset, 6), view(bytes, offset, 6)))

            const inLead = bytes.slice()
            inLead[offset] = 99
            assert.throws(() => TAL.deepEqual(view(bytes, offset, 6), view(inLead, offset, 6)), /deep-equal/)

            const inTail = bytes.slice()
            inTail[offset + 5] = 99
            assert.throws(() => TAL.deepEqual(view(bytes, offset, 6), view(inTail, offset, 6)), /deep-equal/)
        }

        // Every length from 0 up through one that reaches a full word, so
        // the lead-only (no bulk reached yet) path is covered too.
        for (let length = 0; length <= 5; length++) {
            assert.doesNotThrow(() => TAL.deepEqual(view(bytes, 1, length), view(bytes, 1, length)))
        }

        // A difference inside the aligned middle word itself.
        const inBulk = bytes.slice()
        inBulk[4] = 99
        assert.throws(() => TAL.deepEqual(view(bytes, 0, 8), view(inBulk, 0, 8)), /deep-equal/)

        // Different phase on each side: no 32-bit read lands on both, so
        // this falls back to comparing every byte instead of just some.
        const rebased = [0, ...bytes]
        assert.doesNotThrow(() => TAL.deepEqual(view(bytes, 0, 6), view(rebased, 1, 6)))
        rebased[6] = 99
        assert.throws(() => TAL.deepEqual(view(bytes, 0, 6), view(rebased, 1, 6)), /deep-equal/)
    })

    // A detached typed array's byteLength getter reports 0 without throwing,
    // but constructing even a zero-length Uint8Array over its buffer does -
    // sameBytes() must resolve a zero-byte range before touching the buffer.
    it("treats a detached typed array as equal to a fresh empty one", () => {
        const detached = (bytes: number[]): Uint8Array => {
            const view = new Uint8Array(bytes)
            structuredClone(view.buffer, {transfer: [view.buffer]})
            return view
        }
        assert.doesNotThrow(() => TAL.deepEqual(detached([1, 2, 3]), new Uint8Array(0)))
        assert.doesNotThrow(() => TAL.deepEqual(detached([1, 2, 3]), detached([4, 5])))
        // A different element kind is still a different kind, detached or not.
        assert.throws(() => TAL.deepEqual(detached([1, 2, 3]), new Int8Array(0)), /deep-equal/)
    })

    // Unlike a typed array's, DataView's byteLength/byteOffset getters throw
    // on a detached buffer rather than reporting 0 - so this still throws,
    // matching node's own deepEqual for the same comparison on every version.
    it("still throws when a DataView's buffer is detached", () => {
        const detached = (): DataView => {
            const buf = new ArrayBuffer(8)
            const view = new DataView(buf)
            structuredClone(buf, {transfer: [buf]})
            return view
        }
        assert.throws(() => TAL.deepEqual(detached(), detached()), TypeError)
        assert.throws(() => TAL.deepEqual(detached(), new DataView(new ArrayBuffer(0))), TypeError)
    })

    // SharedArrayBuffer isn't an instanceof ArrayBuffer, so it needs its own
    // tag check to reach the same byte-comparison path. The global itself
    // does not exist in a non-cross-origin-isolated browser (this suite's
    // own browser run included), unlike in Node, so this skips there rather
    // than crashing on a bare reference to it.
    it("compares SharedArrayBuffer by byte content too", {skip: "undefined" === typeof SharedArrayBuffer}, () => {
        const bytes = (buf: SharedArrayBuffer, ...values: number[]): SharedArrayBuffer => {
            new Uint8Array(buf).set(values)
            return buf
        }
        assert.doesNotThrow(() => TAL.deepEqual(
            bytes(new SharedArrayBuffer(2), 1, 2),
            bytes(new SharedArrayBuffer(2), 1, 2),
        ))
        assert.throws(() => TAL.deepEqual(
            bytes(new SharedArrayBuffer(2), 1, 2),
            bytes(new SharedArrayBuffer(2), 1, 3),
        ), /deep-equal/)
        // An ArrayBuffer and a SharedArrayBuffer are still a different kind.
        assert.throws(() => TAL.deepEqual(bytes(new SharedArrayBuffer(2), 1, 2), new Uint8Array([1, 2]).buffer), /deep-equal/)
    })
})
