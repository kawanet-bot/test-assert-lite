# Force bash so `set -o pipefail` works in the recipes below.
SHELL := bash
.SHELLFLAGS := -eo pipefail -c

# Documented runtime named export every consumer shape must expose.
NAMED_EXPORTS := after before createTAL describe it run strict suite test

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

test: test-bundled test-bin test-cli test-iife

# Resolves through node_modules after `unpack`; inside a checkout the
# package name self-references dist/ instead.
test-bundled:
	cd ../.. && node builder/tests/bundled.mjs

# npm accepts a broken bin mapping silently -- the .bin link is just
# never created -- so assert the link exists, resolves and is executable.
# Launching the file itself is test-cli's job.
test-bin:
	[ -x ../../node_modules/.bin/test-assert ]

# The CLI end to end -- shebang, executable bit, exit code -- against
# $(PKG_ROOT). The fixtures are staged at $(PKG_ROOT) itself rather than
# run from sample/ in place: a bare "test-assert-lite" import
# self-references from wherever the importing file sits, and sample/ sits
# under the checkout root, which always self-references the checkout's
# own dist/ -- moving the fixture under $(PKG_ROOT) makes it
# self-reference the same dist/ the co-located CLI does, whichever copy
# that is.
test-cli:
	cd ../.. && cp sample/pass.mjs sample/fail.mjs $(PKG_ROOT)/
	cd ../.. && ./$(PKG_ROOT)/dist/test-assert-lite.cli.mjs $(PKG_ROOT)/pass.mjs
	cd ../.. && ! ./$(PKG_ROOT)/dist/test-assert-lite.cli.mjs $(PKG_ROOT)/fail.mjs
	cd ../.. && rm -f $(PKG_ROOT)/pass.mjs $(PKG_ROOT)/fail.mjs

# Script-context run of the minified bundle under $(PKG_ROOT): the browser
# IIFE consumer shape; in the default root it also proves the tarball
# ships the file.
test-iife:
	cd ../.. && (cat $(PKG_ROOT)/dist/test-assert-lite.min.js && echo '; for (const k of process.argv.slice(2)) { if (typeof TAL[k] !== "function") { console.error("missing browser export:", k); process.exit(1); } console.log("browser export OK:", k); }') | node - $(NAMED_EXPORTS)

# Publish gate: the same behavior checks, run against the checkout's own
# staged artifacts in place -- no tarball install involved.
test-dist:
	$(MAKE) test-bundled test-cli test-iife PKG_ROOT=.

clean:
	/bin/rm -f *.tgz

.PHONY: all pack bundled unpack test test-bundled test-bin test-cli test-iife test-dist clean
