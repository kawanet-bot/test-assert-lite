import {strict as assert} from "node:assert"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {createServer} from "node:net"
import {tmpdir} from "node:os"
import {join, relative} from "node:path"
import {after, before, describe, it} from "node:test"
import type {TAL} from "test-assert-lite"
import {session} from "test-assert-lite"
import {CLI} from "./cli.ts"

const TITLE = "extras/cli.test.ts"

// What the CLI itself does between reading the arguments and running
// them: options.test.ts covers the reading. A watch still open would keep
// the process up; a closed one leaves the count a beat later.
const watching = async (): Promise<number> => {
    await new Promise(next => setTimeout(next, 50))
    return process.getActiveResourcesInfo().filter(name => name === "FSEventWrap").length
}

describe(TITLE, () => {
    // A suite of its own, so that --serve has a file to watch whatever was built.
    let dir: string
    let suite: string

    before(async () => {
        dir = await mkdtemp(join(tmpdir(), "tal-cli-"))
        suite = join(dir, "suite.mjs")
        await writeFile(suite, "export const suite = 1")
    })

    after(async () => {
        await rm(dir, {recursive: true, force: true})
    })

    // Node mode runs on the package's own harness, so its session takes the
    // events. A suite that throws while loading is one failed test, named
    // as node --test names it; the tests it declared and the other suites run.
    it("files a suite that threw while loading as one failed test, and runs the rest", async () => {
        const broken = join(dir, "broken.mjs")
        const fine = join(dir, "fine.mjs")
        await writeFile(broken, `import {it} from "node:test"\nit("declared before the throw", () => undefined)\nthrow new Error("at the top level")\n`)
        await writeFile(fine, `import {it} from "node:test"\nit("in the other suite", () => undefined)\n`)
        const events: TAL.TestEvent[] = []
        session({
            reporter: async function* (source) {
                for await (const event of source) events.push(event)
            },
        })

        assert.equal(await CLI({args: [broken, fine]}), 1)
        const results = events.filter(e => e.type === "test:pass" || e.type === "test:fail").map(e => `${e.type} ${e.data.name}`)
        assert.deepEqual(results, ["test:pass declared before the throw", `test:fail ${relative(process.cwd(), broken)}`, "test:pass in the other suite"])
        const failed = events.find(e => e.type === "test:fail")
        assert.equal(failed?.type === "test:fail" && failed.data.details.error.message, "at the top level")
    })

    it("leaves no watch behind when the port asked for is taken", async () => {
        const taken = createServer()
        await new Promise<void>(listening => taken.listen(0, "127.0.0.1", listening))
        const address = taken.address()
        const port = typeof address === "object" && address != null ? address.port : 0
        const before = await watching()
        try {
            await assert.rejects(CLI({args: ["--serve", "--port", String(port), suite]}), /EADDRINUSE/)
            assert.equal(await watching(), before)
        } finally {
            taken.close()
        }
    })
})
