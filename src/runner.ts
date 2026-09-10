// The runner's face to the harness: what declares the tests and suites,
// keeps them between declaration and run(), and runs them. The parts
// live in src/runner/, as the assert's and the reporter's do beside them.

export {createRun} from "./runner/run.ts"
export {createHarnessState, createRegistrar} from "./runner/suite.ts"
