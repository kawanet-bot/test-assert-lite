import type {TAL} from "test-assert-lite"

export interface HostServices {
    /** STDOUT */
    stdout: TAL.Writer
    /** STDERR */
    stderr: TAL.Writer

    begin: (payload?: unknown) => void

    beginning: Promise<unknown>

    end: (result: TAL.SessionResult) => void

    ending: Promise<TAL.SessionResult>

    resolve: (exitCode: number) => void

    reject: (error: unknown) => void

    finished: Promise<number>

    cleanup: () => Promise<void>

    cleanups: Set<(() => unknown) | (() => Promise<unknown>)>
}

export const createHostServices = ({stdout, stderr}: Partial<HostServices> = {}): HostServices => {
    const services = {} as HostServices

    services.stdout = stdout ?? process.stdout
    services.stderr = stderr ?? process.stderr

    services.beginning = new Promise(resolve => (services.begin = resolve))
    services.ending = new Promise(resolve => (services.end = resolve))

    services.cleanups = new Set()

    let cleaned: Promise<void> | null = null
    services.cleanup = () => {
        return cleaned ??= Promise.resolve().then(async () => {
            for (const fn of services.cleanups!) {
                await fn()
            }
        })
    }

    let finished: Promise<void> | null = null
    services.finished = new Promise((resolve, reject) => {
        services.resolve = (result) => (finished ??= services.cleanup().then(() => resolve(result), reject))
        services.reject = (error) => (finished ??= services.cleanup().catch(console.error).finally(() => reject(error)))
    })

    return services as HostServices
}
