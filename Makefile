.DEFAULT_GOAL := help

PNPM ?= pnpm
TAURI_DEV_PORT ?= 1420

.PHONY: help install docs-install check-tauri-dev-port dev dev-fast dev-web dev-backend build package clean docs docs-build check test cargo-check-fast cargo-test-fast db db-list db-verify db-down db-reset db-check db-completion

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

package: node_modules/.modules.yaml ## Build the desktop app package
	$(PNPM) tauri build

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
