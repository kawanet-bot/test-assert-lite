// Declarations for the "test-assert-lite/client" subpath, hand-written
// like the library's own, so the built bundle needs no emitted types.

export interface Client {
    /** Tells the CLI the page is up; it waits for this with a timeout. */
    begin(): Promise<void>
    /** Text for the CLI's stdout, buffered. */
    stdout(text: string): void
    /** Text for the CLI's stderr, buffered. */
    stderr(text: string): void
    /** The verdict, sent once the buffers have drained; true alone passes. */
    end(success: boolean): Promise<void>
}

/**
 * Connects to the CLI at `base`, the run's URL ending in "/". Sending
 * never rejects: the caller can do nothing about a CLI that went away.
 */
export declare function connect(base: string | URL): Client
