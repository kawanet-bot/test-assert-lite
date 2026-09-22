import type {TAL} from "test-assert-lite"
import {stringify} from "../utils/stringify.ts"

/** Host-side streams and lifecycle shared for one browser run. */
export interface HostServices {
    /** Receives the page's standard output. */
    stdout: TAL.Writer
    /** Receives the page's standard error and host logs. */
    stderr: TAL.Writer

    /** Reports that the page has started. */
    begin: (payload?: unknown) => void
    /** The first payload reported at begin. */
    beginning: Promise<unknown>

    /** Reports the page's session result. */
    end: (result?: TAL.SessionResult) => void
    /** The first session result reported at end. */
    ending: Promise<TAL.SessionResult | undefined>

    /** Finishes successfully after cleanup. */
    resolve: (result?: TAL.SessionResult) => void
    /** Fails with the error after cleanup. */
    reject: (error: unknown) => void
    /** The first resolve or reject, settled after cleanup. */
    finished: Promise<TAL.SessionResult | undefined>

    /** Runs the registered cleanup functions. */
    cleanup: () => Promise<void>
    /** Register a cleanup function. */
    onCleanup: (fn: () => unknown) => void
}

/** Creates the host-side services shared by the server and browser driver. */
export const createHostServices = ({stdout, stderr}: Partial<HostServices> = {}): HostServices => {
    const services = {} as HostServices

    services.stdout = stdout ?? process.stdout
    services.stderr = stderr ?? process.stderr

    services.beginning = new Promise(resolve => (services.begin = resolve))
    services.ending = new Promise(resolve => (services.end = resolve))

    const showError = (e: unknown): void => {
        services.stderr.write(`${stringify(e)}\n`)
    }

    let cleaning = false
    let cleanups = new Promise<void>(resolve => {
        services.cleanup = () => {
            cleaning = true
            resolve()
            return cleanups
        }
    })

    services.onCleanup = (fn) => {
        const run = cleaning ? () => Promise.resolve().then(fn).catch(showError) : fn
        cleanups = cleanups.finally(run)
    }

    // The first resolve or reject owns the result and starts cleanup.
    let finished: Promise<void> | null = null
    services.finished = new Promise((resolve, reject) => {
        services.resolve = (result) => (finished ??= services.cleanup().then(() => resolve(result), reject))
        services.reject = (error) => (finished ??= services.cleanup().catch(showError).finally(() => reject(error)))
    })

    return services as HostServices
}
