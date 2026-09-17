import {createTAL} from "./harness.ts"

export {createTAL}

// The one harness the package's own entries and pages share; createTAL()
// hands out another, apart from it.
export const sharedTAL = createTAL()
