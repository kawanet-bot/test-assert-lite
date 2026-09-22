// The errors outside the tests, each one failed test at the root: a
// window's error and unhandledrejection events, or a process's
// uncaughtException and unhandledRejection. Declared on the root itself,
// since one may arrive while a test body is open, and the walk takes it.

import type {TAL} from "test-assert-lite"
import type {HarnessState} from "./state.ts"

type EventTargetLike = TAL.EventTargetLike
type EventEmitterLike = TAL.EventEmitterLike

type Take = (name: string, error: unknown) => void

// The suites are served under a digest-named directory; the name a
// person knows is what follows it.
const SERVED = /^\/@tal\/files\/[0-9a-f]{9}\//

// A window's: named after the script the event says it came from, as a
// suite that threw is under Node.
const takeFromTarget = (take: Take, target: EventTargetLike): (() => void) => {
    const nameOf = (url: string | undefined): string | undefined => {
        try {
            return url ? new URL(url).pathname.replace(SERVED, "") : undefined
        } catch {
            return url
        }
    }
    const onError = (event: unknown): void => {
        const {error, message, filename, target} = event as Partial<ErrorEvent>
        const src = (target as {src?: string} | null | undefined)?.src
        const name = nameOf(filename || src) ?? "error"
        take(name, error ?? new Error(message || `failed to load ${name}`))
    }
    const onRejection = (event: unknown): void => {
        take("unhandled rejection", (event as Partial<PromiseRejectionEvent>).reason)
    }
    target.addEventListener("error", onError, true)
    target.addEventListener("unhandledrejection", onRejection)
    return () => {
        target.removeEventListener("error", onError, true)
        target.removeEventListener("unhandledrejection", onRejection)
    }
}

// A process's: while listened to, an exception no longer ends the process.
const takeFromEmitter = (take: Take, target: EventEmitterLike): (() => void) => {
    const onException = (error: unknown): void => take("uncaught exception", error)
    const onRejection = (reason: unknown): void => take("unhandled rejection", reason)
    target.on("uncaughtException", onException)
    target.on("unhandledRejection", onRejection)
    return () => {
        target.off("uncaughtException", onException)
        target.off("unhandledRejection", onRejection)
    }
}

const isEventTarget = (value: unknown): value is EventTargetLike => {
    const v = value as Partial<EventTargetLike> | null | undefined
    return "function" === typeof v?.addEventListener && "function" === typeof v?.removeEventListener
}

const isEventEmitter = (value: unknown): value is EventEmitterLike => {
    const v = value as Partial<EventEmitterLike> | null | undefined
    return "function" === typeof v?.on && "function" === typeof v?.off
}

// Listens on the target given, and returns what stops listening.
export const takeUncaught = (harness: HarnessState, target: EventTargetLike | EventEmitterLike): (() => void) => {
    const take: Take = (name, error) => {
        harness.root.declareTest(name, {}, () => {
            throw error
        })
    }
    if (isEventTarget(target)) return takeFromTarget(take, target)
    if (isEventEmitter(target)) return takeFromEmitter(take, target)
    throw new Error("uncaught takes a window or a process: an EventTarget or an EventEmitter")
}
