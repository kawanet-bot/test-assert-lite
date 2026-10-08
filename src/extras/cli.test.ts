import {strict as assert} from "node:assert"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {createServer} from "node:net"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {after, before, describe, it} from "node:test"
import type {BrowserType} from "playwright-core"
import {connect, argv as libraryArgv} from "test-assert-lite/process"
import {CLI} from "./cli.ts"

const TITLE = "extras/cli.test.ts"

// The CLI reports down the realm's channel, so a test reads its stdout
// there and leaves process.stdout, which node:test reports through, alone.
const connectStdout = (): string[] => {
    const chunks: string[] = []
    connect({fetch: (async (path: string, init: {body: string}) => (void (path === "stdout" && chunks.push(init.body)), {ok: true})) as unknown as typeof fetch})
    return chunks
}

// The CLI's own part, between reading the arguments and running them.
// options.test.ts covers the reading. A watch still open would keep the
// process up, and a closed one leaves the count a beat later.
const watching = async (): Promise<number> => {
    await new Promise(next => setTimeout(next, 50))
    return process.getActiveResourcesInfo().filter(name => name === "FSEventWrap").length
}

describe(TITLE, () => {
    // A file of its own for --serve to watch, as index.js, whatever was built.
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

    // A suite that throws while loading is one failed test.
    it("files a suite that threw while loading as one failed test, and runs the rest", async () => {
        const broken = join(dir, "broken.mjs")
        const fine = join(dir, "fine.mjs")
        await writeFile(broken, `import {it} from "node:test"\nit("declared before the throw", () => undefined)\nthrow new Error("at the top level")\n`)
        await writeFile(fine, `import {it} from "node:test"\nit("in the other suite", () => undefined)\n`)
        const chunks = connectStdout()
        assert.equal(await CLI({args: ["--test", "--reporter", "tap", broken, fine]}), 1)
        const lines = chunks.join("").split("\n")
        const results = lines.filter(line => /^(not )?ok /.test(line))
        assert.deepEqual(results, ["ok 1 - declared before the throw", `not ok 2 - broken.mjs`, "ok 3 - in the other suite"])
        assert.ok(lines.includes("# Error: at the top level"), lines.join("\n"))
    })

    it("runs the script -e gives in place of the files, its tests through the same hook", async () => {
        const helper = join(dir, "helper.mjs")
        await writeFile(helper, `export const name = "inline"\n`)
        const chunks = connectStdout()
        const cwd = process.cwd()
        process.chdir(dir)
        try {
            const script = `import {it} from "node:test"\nimport {name} from "./helper.mjs"\nit(name, () => undefined)\n`
            assert.equal(await CLI({args: ["--reporter", "tap", "-e", script]}), 0)
        } finally {
            process.chdir(cwd)
        }
        const lines = chunks.join("").split("\n")
        assert.deepEqual(lines.filter(line => /^(not )?ok /.test(line)), ["ok 1 - inline"])
    })

    it("leaves node:process to Node under the CLI, where a suite reads argv from it", async () => {
        const chunks = connectStdout()
        const script = `import {it} from "node:test"\nimport {argv} from "node:process"\nit(Array.isArray(argv) ? "argv is an array" : "argv is not", () => undefined)\n`
        assert.equal(await CLI({args: ["--reporter", "tap", "-e", script]}), 0)
        assert.ok(chunks.join("").includes("ok 1 - argv is an array"))
    })

    it("gives the suites the arguments past the file as process.argv, as node does", async () => {
        const chunks = connectStdout()
        const argv = [...process.argv]
        try {
            const script = `import {it} from "node:test"\nimport {argv} from "node:process"\nit(argv.slice(1).join(" "), () => undefined)\n`
            assert.equal(await CLI({args: ["--reporter", "tap", "-e", script, "--", "one", "--two"]}), 0)
        } finally {
            process.argv.splice(0, process.argv.length, ...argv)
        }
        assert.ok(chunks.join("").includes("ok 1 - one --two"))
    })

    it("gives test-assert-lite/process the same argv as node:process", async () => {
        const chunks = connectStdout()
        const argv = [...process.argv]
        const saved = [...libraryArgv]
        try {
            const script = `import {it} from "node:test"\nimport {argv} from "test-assert-lite/process"\nimport process from "node:process"\nit(argv.slice(1).join(" ") + (argv[0] === process.argv[0] ? " same argv[0]" : " other argv[0]"), () => undefined)\n`
            assert.equal(await CLI({args: ["--reporter", "tap", "-e", script, "--", "one", "--two"]}), 0)
        } finally {
            process.argv.splice(0, process.argv.length, ...argv)
            connect({argv: saved})
        }
        assert.ok(chunks.join("").includes("ok 1 - one --two same argv[0]"))
    })

    it("says nothing of a script with no tests, and counts to zero for a test runner's", async () => {
        const empty = join(dir, "empty.mjs")
        await writeFile(empty, "")
        const chunks = connectStdout()
        assert.equal(await CLI({args: ["-e", ""]}), 0)
        assert.equal(chunks.join("").includes("ℹ tests"), false)
        assert.equal(await CLI({args: ["--test", empty]}), 0)
        assert.ok(chunks.join("").includes("ℹ tests 0"))
    })

    it("refuses a flag that chooses a mode once the executable fixed one, as a usage error", async () => {
        assert.equal(await CLI({args: ["--serve", suite], webdriver: true}), 2)
        assert.equal(await CLI({args: ["--endpoint", "http://x", suite], playwright: {launch: async () => ({})} as unknown as BrowserType}), 2)
    })

    it("leaves no watch behind when the port asked for is taken", async () => {
        const taken = createServer()
        await new Promise<void>(listening => taken.listen(0, "127.0.0.1", listening))
        const address = taken.address()
        const port = typeof address === "object" && address != null ? address.port : 0
        const before = await watching()
        try {
            await assert.rejects(CLI({args: ["--serve", "--port", String(port), "--alias", `index.js=${suite}`]}), /EADDRINUSE/)
            assert.equal(await watching(), before)
        } finally {
            taken.close()
        }
    })
})
