import type {TAL} from "test-assert-lite"

export interface DriverConfig {
    options: DriverOptions
}

export interface DriverOptions {
    reporter: keyof TAL.Reporter
}
