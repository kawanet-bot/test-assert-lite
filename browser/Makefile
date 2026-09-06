# Force bash so `set -o pipefail` works in the recipes below.
SHELL := bash
.SHELLFLAGS := -eo pipefail -c

PLAYWRIGHT_VERSION := 1.62.1

MINJS_DST := ../dist/test-assert-lite.min.js
BROWSER_TEST_DST := ../browser/tests/bundled.js

# The bundle rule, its size check, and its dependencies belong to the
# repository-wide builder Makefile. This entry point is for browser CI.
all: bundled

bundled:
	$(MAKE) -C ../builder $(MINJS_DST) $(BROWSER_TEST_DST)

# Keep Playwright out of package.json. CI installs it transiently alongside
# the project's build dependencies, then downloads only the headless shell.
install: install-browser

install-playwright:
	cd .. && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright@$(PLAYWRIGHT_VERSION) --no-save --ignore-scripts --no-audit --no-fund

# --with-deps re-runs apt-get (with sudo) even when nothing is missing.
# install-deps --dry-run asks Playwright itself whether the OS packages for
# this browser are present, with no download/network/sudo side effects.
# Deferred (=): only evaluated when this recipe actually runs.
DEPS_OK = $(shell npx --no-install playwright install-deps chromium-headless-shell --dry-run >/dev/null 2>&1 && echo YES)

install-browser: install-playwright
	cd .. && npx --no-install playwright install --only-shell chromium$(if $(DEPS_OK),, --with-deps)

test: all
	cd .. && node browser/tests.cli.mjs

# Browser bundle cleanup remains owned by builder/Makefile.
clean:
	@: # NOP

.PHONY: all bundled install install-playwright install-browser test clean
