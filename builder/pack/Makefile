# Force bash so `set -o pipefail` works in the recipes below.
SHELL := bash
.SHELLFLAGS := -eo pipefail -c

# Sequential by design: the checks are quick and their output reads best
# in order, so -j buys nothing. This also blocks a -j inherited through
# MAKEFLAGS.
.NOTPARALLEL:

# Documented runtime named export every consumer shape must expose.
NAMED_EXPORTS := after assert before createTAL describe end it session strict suite test

# Root of the copy under test: the installed package after `unpack`, or
# the checkout itself (PKG_ROOT=.) for the publish gate, which runs the
# staged artifacts in place without installing anything.
PKG_ROOT ?= node_modules/test-assert-lite

# A target name in builder/, not a path from here.
BUILDER_TEST_DST := ./tests/bundled.mjs

# The workflows drive these steps in order:
#   nodejs.yml   pack bundled unpack test
#   publish.yml  bundled test-dist

# Package-side lifecycle: `pack` builds the tarball (renamed to the fixed
# packed.tgz), `unpack` installs it (--no-save also works in a checkout),
# `test` exercises it. Build `bundled` only after `pack`: npm pack runs
# prepare, whose clean wipes the generated test bundle.
all: pack

pack: clean
	cd ../.. && npm pack --pack-destination builder/pack
	mv *-*.*.*.tgz packed.tgz

bundled:
	$(MAKE) -C .. $(BUILDER_TEST_DST)

# The lane has no manifest, so the test-only peers the suites need come
# from builder/pack/package.json. It names no package and declares no
# exports, which is what keeps a self-reference from beating node_modules.
# A checkout has its own manifest and keeps it.
unpack:
	[ -e ../../package.json ] || cp package.json ../../
	cd ../.. && npm install ./builder/pack/packed.tgz --no-audit --no-fund --no-save --engine-strict

test: test-bundled test-bin test-cli test-esm

# The bundle only registers tests and never calls end() itself, so it
# needs a runner -- $(PKG_ROOT)'s own CLI, matching whichever copy the
# bundle's own self-reference resolves to. The slow suites, skipped in a
# plain run, are wanted here: this is the packed copy on every Node line.
test-bundled:
	cd ../.. && TAL_SLOW_TESTS=1 ./$(PKG_ROOT)/bin/cli.mjs builder/tests/bundled.mjs

# npm accepts a broken bin mapping silently -- the .bin link is just
# never created -- so assert the link exists, resolves and is executable.
# Launching the file itself is test-cli's job.
test-bin:
	[ -x ../../node_modules/.bin/test-assert ]

# The CLI end to end against the copy under test. The fixtures import
# node:test, which the CLI's hook points at its own copy, so the symlink
# in sample/node_modules is not on that path: it is there, remade per
# lane, so a `node --test` run from sample/ reaches the same copy by
# its package name. Only the exit codes matter here.
test-cli:
	mkdir -p ../../sample/node_modules
	[ -L ../../sample/node_modules/test-assert-lite ] || rm -rf ../../sample/node_modules/test-assert-lite
	cd ../.. && target=$$(cd $(PKG_ROOT) && pwd -P) && ln -sfn "$$target" sample/node_modules/test-assert-lite
	cd ../.. && ./$(PKG_ROOT)/bin/cli.mjs sample/pass.mjs > /dev/null 2>&1
	cd ../.. && ! ./$(PKG_ROOT)/bin/cli.mjs sample/fail.mjs > /dev/null 2>&1
	cd ../.. && ./$(PKG_ROOT)/bin/cli.mjs --alias greet=sample/lib/greet.mjs sample/alias.mjs > /dev/null 2>&1
	cd ../.. && ./$(PKG_ROOT)/bin/cli.mjs --import-map sample/import-map.json sample/alias.mjs > /dev/null 2>&1

# The minified bundle under $(PKG_ROOT) imported as the ES module it is,
# by its path, the browser consumer shape; in the default root it also
# proves the tarball ships the file.
test-esm:
	cd ../.. && node --input-type=module -e 'import {pathToFileURL} from "node:url"; const m = await import(pathToFileURL("$(PKG_ROOT)/dist/test-assert-lite.min.js").href); for (const k of process.argv.slice(1)) { if (typeof m[k] !== "function") { console.error("missing browser export:", k); process.exit(1); } console.log("browser export OK:", k); }' -- $(NAMED_EXPORTS)

# Publish gate: the same behavior checks, run against the checkout's own
# staged artifacts in place -- no tarball install involved.
test-dist:
	$(MAKE) test-bundled test-cli test-esm PKG_ROOT=.

clean:
	/bin/rm -f *.tgz

.PHONY: all pack bundled unpack test test-bundled test-bin test-cli test-esm test-dist clean
