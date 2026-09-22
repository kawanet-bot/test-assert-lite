import type {TAL} from "test-assert-lite"

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
    end: (result: TAL.SessionResult) => void
    /** The first session result reported at end. */
    ending: Promise<TAL.SessionResult>

    /** Finishes successfully after cleanup. */
    resolve: (exitCode: number) => void
    /** Fails with the error after cleanup. */
    reject: (error: unknown) => void
    /** The first resolve or reject, settled after cleanup. */
    finished: Promise<number>

    /** Runs the registered cleanup functions once. */
    cleanup: () => Promise<void>
    /** Cleanup functions, run once in insertion order. Add them before cleanup starts. */
    cleanups: Set<(() => unknown) | (() => Promise<unknown>)>
}

/** Creates the host-side services shared by the server and browser driver. */
export const createHostServices = ({stdout, stderr}: Partial<HostServices> = {}): HostServices => {
    const services = {} as HostServices

    services.stdout = stdout ?? process.stdout
    services.stderr = stderr ?? process.stderr

    services.beginning = new Promise(resolve => (services.begin = resolve))
    services.ending = new Promise(resolve => (services.end = resolve))

    services.cleanups = new Set()

    // Concurrent callers wait for the same cleanup pass.
    let cleaned: Promise<void> | null = null
    services.cleanup = () => {
        return cleaned ??= Promise.resolve().then(async () => {
            for (const fn of services.cleanups!) {
                await fn()
            }
        })
    }

    // The first resolve or reject owns the result and starts cleanup.
    let finished: Promise<void> | null = null
    services.finished = new Promise((resolve, reject) => {
        services.resolve = (result) => (finished ??= services.cleanup().then(() => resolve(result), reject))
        services.reject = (error) => (finished ??= services.cleanup().catch(console.error).finally(() => reject(error)))
    })

    return services as HostServices
}
