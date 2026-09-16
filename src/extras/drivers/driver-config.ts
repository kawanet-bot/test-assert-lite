// What the command line hands the run, in Node and in a page alike: JSON,
// so a page can take it from a script tag, and no function crosses over.

export interface DriverConfig {
    options: DriverOptions
}

export interface DriverOptions {
    /** The reporter named on the command line; spec unless given. */
    reporter?: string
    /** The test files to import, in order: paths under Node, served URLs in a page. */
    files?: string[]
}
