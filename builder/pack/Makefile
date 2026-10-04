# Force bash so `set -o pipefail` works in the recipes below.
SHELL := bash
.SHELLFLAGS := -eo pipefail -c

# Sequential by design: the checks are quick and their output reads best
# in order, so -j buys nothing. This also blocks a -j inherited through
# MAKEFLAGS.
.NOTPARALLEL:

# Where the two packages under test sit: installed after `unpack`, or the
# checkout's own (PKG_ROOT=packages) for the publish gate, which runs the
# staged artifacts in place without installing anything.
PKG_ROOT ?= node_modules
CLI_ROOT := $(PKG_ROOT)/test-assert-cli
LIB_ROOT := $(PKG_ROOT)/test-assert-lite

# A target name in builder/, not a path from here.
BUILDER_TEST_DST := ./tests/bundled.mjs

# The workflows drive these steps in order:
#   nodejs.yml   pack bundled unpack test
#   publish.yml  bundled test-dist

# Package-side lifecycle: `pack` builds the two tarballs (renamed to fixed
# names), `unpack` installs them (--no-save also works in a checkout),
# `test` exercises them. Build `bundled` only after `pack`: npm pack runs
# prepare, whose clean wipes the generated test bundle.
all: pack

pack: clean
	cd ../.. && npm pack -w packages/test-assert-lite -w packages/test-assert-cli --pack-destination builder/pack
	mv test-assert-lite-*.tgz lite.tgz
	mv test-assert-cli-*.tgz cli.tgz

bundled:
	$(MAKE) -C .. $(BUILDER_TEST_DST)

# The lane has no manifest, so builder/pack/package.json stands in. It names
# no package and declares no exports, so no self-reference beats
# node_modules. A checkout keeps its own. The CLI depends on the library
# by version, and the library's tarball installed beside it satisfies that.
unpack:
	[ -e ../../package.json ] || cp package.json ../../
	cd ../.. && npm install ./builder/pack/lite.tgz ./builder/pack/cli.tgz --no-audit --no-fund --no-save --engine-strict

test: test-bundled test-bin test-cli

# The bundle only registers tests and never calls run() itself, so it
# needs a runner -- $(CLI_ROOT)'s own, matching whichever copy the
# bundle's own self-reference resolves to. The slow suites, skipped in a
# plain run, are wanted here: this is the packed copy on every Node line.
test-bundled:
	cd ../.. && TAL_SLOW_TESTS=1 ./$(CLI_ROOT)/bin/tacli.js builder/tests/bundled.mjs

# npm accepts a broken bin mapping silently -- the .bin link is just
# never created -- so assert the link exists, resolves and is executable.
# Launching the file itself is test-cli's job.
test-bin:
	[ -x ../../node_modules/.bin/tacli ]

# The CLI end to end against the copies under test. The CLI's hook points
# node:test at its library, so the symlink in sample/node_modules is not on
# that path. It is remade per lane so that `node --test` from sample/
# reaches the same copy by its package name. Only the exit codes matter.
test-cli:
	mkdir -p ../../sample/node_modules
	[ -L ../../sample/node_modules/test-assert-lite ] || rm -rf ../../sample/node_modules/test-assert-lite
	cd ../.. && target=$$(cd $(LIB_ROOT) && pwd -P) && ln -sfn "$$target" sample/node_modules/test-assert-lite
	cd ../.. && ./$(CLI_ROOT)/bin/tacli.js sample/pass.js > /dev/null 2>&1
	cd ../.. && ! ./$(CLI_ROOT)/bin/tacli.js sample/fail.js > /dev/null 2>&1
	cd ../.. && ./$(CLI_ROOT)/bin/tacli.js --alias greet=sample/lib/greet.js sample/alias.js > /dev/null 2>&1
	cd ../.. && ./$(CLI_ROOT)/bin/tacli.js --import-map sample/import-map.json sample/alias.js > /dev/null 2>&1

# Publish gate: the same behavior checks, run against the checkout's own
# staged artifacts in place -- no tarball install involved.
test-dist:
	$(MAKE) test-bundled test-cli PKG_ROOT=packages

clean:
	/bin/rm -f *.tgz

.PHONY: all pack bundled unpack test test-bundled test-bin test-cli test-dist clean
