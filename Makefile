.DEFAULT_GOAL := help

PNPM ?= pnpm
TAURI_DEV_PORT ?= 1420
APP_BUNDLE ?= target/release/bundle/macos/DBX.app
APP_INSTALL_DIR ?= /Applications
# Inputs of the packaged app; a file under these newer than APP_BUNDLE triggers a rebuild.
APP_SOURCES := apps crates src-tauri packages plugins vendor scripts/sync-connection-types.mjs Cargo.toml Cargo.lock package.json pnpm-lock.yaml pnpm-workspace.yaml
# Signing the updater archive needs the release private key; without it, skip updater artifacts so local builds succeed.
ifeq ($(TAURI_SIGNING_PRIVATE_KEY),)
TAURI_BUILD_FLAGS ?= --config '{"bundle":{"createUpdaterArtifacts":false}}'
endif

.PHONY: help install docs-install check-tauri-dev-port dev dev-fast dev-web dev-backend build package reinstall clean docs docs-build check test cargo-check-fast cargo-test-fast db db-list db-verify db-down db-reset db-check db-completion

export DB
export DB_VERSION
export DB_BIND_ADDRESS
export DB_PORT
export DB_PASSWORD
export FOLLOW
export CONFIRM

node_modules/.modules.yaml: package.json pnpm-lock.yaml
	$(PNPM) install --frozen-lockfile

docs/node_modules/.modules.yaml: docs/package.json docs/pnpm-lock.yaml docs/pnpm-workspace.yaml $(wildcard docs/patches/*.patch)
	cd docs && $(PNPM) install --frozen-lockfile

install: ## Install root project dependencies
	$(PNPM) install --frozen-lockfile

docs-install: ## Install documentation site dependencies
	cd docs && $(PNPM) install --frozen-lockfile

ifeq ($(OS),Windows_NT)
check-tauri-dev-port:
	@powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort $(TAURI_DEV_PORT) -State Listen -ErrorAction SilentlyContinue) { Write-Host 'Port $(TAURI_DEV_PORT) is already in use. DBX Tauri dev requires http://localhost:$(TAURI_DEV_PORT).'; Write-Host ''; Get-NetTCPConnection -LocalPort $(TAURI_DEV_PORT) -State Listen -ErrorAction SilentlyContinue | Format-Table LocalAddress,LocalPort,OwningProcess -AutoSize; Write-Host 'Stop the process above, then run make dev again.'; exit 1 }"
else
check-tauri-dev-port:
	@if lsof -nP -iTCP:$(TAURI_DEV_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Port $(TAURI_DEV_PORT) is already in use. DBX Tauri dev requires http://localhost:$(TAURI_DEV_PORT)."; \
		echo ""; \
		lsof -nP -iTCP:$(TAURI_DEV_PORT) -sTCP:LISTEN; \
		echo ""; \
		echo "Stop the process above, then run make dev again. Example: kill <PID>"; \
		exit 1; \
	fi
endif

dev: node_modules/.modules.yaml check-tauri-dev-port ## Start the local desktop development environment
	$(PNPM) dev:tauri

dev-fast: node_modules/.modules.yaml check-tauri-dev-port ## Start lightweight Tauri dev with DuckDB sidecar support
	RUST_MIN_STACK=16777216 $(PNPM) tauri dev -- --no-default-features --features duckdb-sidecar,dynamodb,sqlite-bundled

dev-web: node_modules/.modules.yaml ## Start the web frontend development server
	$(PNPM) dev:web

dev-backend: node_modules/.modules.yaml ## Start the web backend development server
	$(PNPM) dev:backend

build: node_modules/.modules.yaml ## Run type checks and build the desktop frontend
	$(PNPM) build:checked

# CI=true makes Tauri pass --skip-jenkins to bundle_dmg.sh, so the DMG step does not pop up a Finder window.
package: node_modules/.modules.yaml ## Build the desktop app package
	CI=true $(PNPM) tauri build $(TAURI_BUILD_FLAGS)

reinstall: node_modules/.modules.yaml ## Rebuild DBX.app if sources changed, then replace it in /Applications (macOS). FORCE=1 always rebuilds
	@test "$$(uname)" = Darwin || { echo "make reinstall only supports macOS"; exit 1; }
	@newest=$$(git ls-files -co --exclude-standard -z -- $(APP_SOURCES) | xargs -0 stat -f '%m' 2>/dev/null | sort -n | tail -1); \
	if [ "$(FORCE)" = 1 ] || [ ! -d "$(APP_BUNDLE)" ] || [ "$$newest" -gt "$$(stat -f '%m' "$(APP_BUNDLE)")" ]; then \
		echo "==> Sources changed since last package, rebuilding $(APP_BUNDLE)"; \
		$(PNPM) tauri build --bundles app $(TAURI_BUILD_FLAGS) && touch "$(APP_BUNDLE)"; \
	else \
		echo "==> $(APP_BUNDLE) is up to date, skipping build"; \
	fi
	@if LC_ALL=C pgrep -qf '/DBX.app/Contents/MacOS/dbx'; then \
		echo "==> Quitting running DBX"; \
		osascript -e 'tell application id "com.dbx.app" to quit' >/dev/null 2>&1 || true; \
		for _ in 1 2 3 4 5 6 7 8 9 10; do LC_ALL=C pgrep -qf '/DBX.app/Contents/MacOS/dbx' || break; sleep 1; done; \
		if LC_ALL=C pgrep -qf '/DBX.app/Contents/MacOS/dbx'; then echo "DBX is still running, quit it and retry"; exit 1; fi; \
	fi
	@echo "==> Removing $(APP_INSTALL_DIR)/DBX.app"
	@rm -rf "$(APP_INSTALL_DIR)/DBX.app"
	@echo "==> Installing $(APP_BUNDLE) to $(APP_INSTALL_DIR)"
	@ditto "$(APP_BUNDLE)" "$(APP_INSTALL_DIR)/DBX.app"

clean: ## Remove local Rust build artifacts and caches
	cargo clean

docs: docs/node_modules/.modules.yaml ## Start the documentation site development server
	cd docs && ./node_modules/.bin/next dev --hostname 127.0.0.1

docs-build: docs/node_modules/.modules.yaml ## Build the documentation site
	cd docs && ./node_modules/.bin/next build && node scripts/generate-sitemap.mjs

check: node_modules/.modules.yaml ## Run project checks
	$(PNPM) check

test: node_modules/.modules.yaml ## Run project tests
	$(PNPM) test

cargo-check-fast: ## Run Rust check without default features
	cargo check --no-default-features --features sqlite-bundled

cargo-test-fast: ## Run Rust tests without default features
	RUST_MIN_STACK=8388608 cargo test --no-default-features --features sqlite-bundled

db-list: ## List available database versions
	@$(PNPM) db:env -- list

db: ## Start and print DBX connection fields, e.g. DB=mysql@8.4
	@$(PNPM) db:env -- start

db-verify: ## Start and run smoke checks, e.g. DB=mysql@8.4
	@$(PNPM) db:env -- verify

db-down: ## Stop an environment, e.g. DB=mysql@8.4
	@$(PNPM) db:env -- down

db-reset: ## Delete containers and data, e.g. DB=mysql@8.4 CONFIRM=1
	@$(PNPM) db:env -- reset

db-check: ## Validate every recipe and Compose file
	@$(PNPM) db:env -- check

db-completion: ## Show Bash/Zsh completion setup
	@$(PNPM) db:env -- completion

help: ## Show this help
	@grep -h -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
