// Declarations for the "test-assert-lite/extras" subpath, hand-written
// like the library's own, so the built bundle needs no emitted types.

export interface CLIOptions {
    /** The arguments as the executable gets them: process.argv.slice(2). */
    args: string[]
}

/**
 * Runs the command line with the arguments given and resolves to its exit
 * code. Writes what the command line writes and never exits the process.
 */
export declare function CLI(options: CLIOptions): Promise<number>
