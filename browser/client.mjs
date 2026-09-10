// The client as a page gets it: reporter.client() bound to this file's
// own URL, which the CLI serves under the run's id. The page imports this
// by the package name through the import map and never sees that id.

import {reporter} from "test-assert-lite"

export const connect = () => reporter.client(new URL("./", import.meta.url))
