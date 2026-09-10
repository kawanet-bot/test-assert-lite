// The client as a page gets it: the built one, bound to this file's own
// URL, which the CLI serves under the run's id. The page imports this by
// the package name through the import map and never sees that id.

import {connect as bind} from "/@tal/dist/test-assert-lite.client.mjs"

export const connect = () => bind(new URL("./", import.meta.url))
