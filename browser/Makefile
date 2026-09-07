# Force bash so `set -o pipefail` works in the recipes below.
SHELL := bash
.SHELLFLAGS := -eo pipefail -c

# Sequential by design: nothing here gains from -j, and `test` leans on
# install running before the build. This also blocks a -j inherited
# through MAKEFLAGS.
.NOTPARALLEL:

PLAYWRIGHT_VERSION := 1.62.1

MJS_DST := ../dist/test-assert-lite.mjs
MINJS_DST := ../dist/test-assert-lite.min.js
BROWSER_TEST_DST := ../browser/tests/bundled.mjs

# The bundle rule, its size check, and its dependencies belong to the
# repository-wide builder Makefile. This entry point is for browser CI.
all: bundled

# Build tools come from the package's own npm install; `serve` must not
# pull Playwright in, so the bundle does not depend on install-playwright.
bundled:
	$(MAKE) -C ../builder $(MJS_DST) $(MINJS_DST) $(BROWSER_TEST_DST)

# Keep Playwright out of package.json. CI installs it transiently alongside
# the project's build dependencies, then downloads only the headless shell.
install: install-browser

# npm's own up-to-date check is the slow part of a repeat run. Comparing the
# installed version is near-free and also catches a PLAYWRIGHT_VERSION bump.
PLAYWRIGHT_INSTALLED = $(shell cd .. && node -p 'require("playwright/package.json").version' 2>/dev/null)

install-playwright:
	@[ "$(PLAYWRIGHT_INSTALLED)" = "$(PLAYWRIGHT_VERSION)" ] || \
	( cd .. && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright@$(PLAYWRIGHT_VERSION) --no-save --ignore-scripts --no-audit --no-fund )

# --with-deps re-runs apt-get (with sudo) even when nothing is missing. A
# launch that succeeds is exactly what `test` needs, so probe that and skip
# the flag; any failure (no binary, missing libs, fresh runner) keeps it.
# Deferred (=): only evaluated when this recipe actually runs.
LAUNCHABLE = $(shell cd .. && node -e 'require("playwright").chromium.launch().then(b=>b.close()).catch(()=>process.exit(1))' 2>/dev/null && echo YES)

install-browser: install-playwright
	cd .. && npx --no-install playwright install --only-shell chromium$(if $(LAUNCHABLE),, --with-deps)

# `install` first: its npm step also brings the build tools, so a plain
# `make -C browser test` works from a clean checkout. It is cheap once
# Playwright and the browser are present (see LAUNCHABLE).
test: install all
	cd .. && node src/cli/test-assert-lite.cli.ts --chromium browser/tests/bundled.mjs

# The same bundle for a person: prints the URL and serves until Ctrl-C.
serve: all
	cd .. && node src/cli/test-assert-lite.cli.ts --serve browser/tests/bundled.mjs

# Browser bundle cleanup remains owned by builder/Makefile.
clean:
	@: # NOP

.PHONY: all bundled install install-playwright install-browser test serve clean
