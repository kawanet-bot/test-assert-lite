import {Root} from "../suite/root.ts"
import type {Tester} from "../suite/tester.ts"

// The registration state of one harness: the tree declared so far and the
// suite whose body is running, which is where a declaration lands. Wrapping
// it in a factory lets the self-tests build an isolated tree.
export interface HarnessState {
    root: Root
    current: Tester
    // Tester bodies not yet settled, a timed out one included, and suite
    // bodies being run. A declaration is taken while a suite body runs, and
    // rejected while only a test body is open: from inside one, or from a
    // timed out one, which would otherwise land it in a later run.
    openBodies: number
    openSuites: number
}

// The root and the state point at each other, so the state is made first
// and the root put in, here and on every reset.
export const createHarnessState = (): HarnessState => {
    const state = {openBodies: 0, openSuites: 0} as HarnessState
    resetHarnessState(state)
    return state
}

export const resetHarnessState = (state: HarnessState): void => {
    state.root = new Root(state)
    state.current = state.root
}
