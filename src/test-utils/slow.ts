import {describe} from "node:test"

// Suites that wait on real time. They flake where the timing cannot be
// trusted and slow every run, so they are skipped unless asked for. The
// typeof guard keeps the bare `process` reference out of browsers.
const wanted = "undefined" !== typeof process && !!process.env.TAL_SLOW_TESTS

export const describeSlow = wanted ? describe : describe.skip

// Every wait in those suites goes through here, so the margins between a
// timeout, a body and a slow reporter can be widened together when a
// runner turns out to need more room. The tests keep their own numbers.
const SCALE = 2

export const slow = (ms: number): number => ms * SCALE
