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

    let cleaning = new Promise<void>(resolve => {
        services.cleanup = () => {
            resolve()
            return cleaning
        }
    })

    services.onCleanup = (fn) => {
        cleaning = cleaning.finally(() => fn())
    }

    // The first resolve or reject owns the result and starts cleanup.
    let finished: Promise<void> | null = null
    services.finished = new Promise((resolve, reject) => {
        services.resolve = (result) => (finished ??= services.cleanup().then(() => resolve(result), reject))
        services.reject = (error) => (finished ??= services.cleanup().catch(console.error).finally(() => reject(error)))
    })

    return services as HostServices
}
