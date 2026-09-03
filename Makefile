SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PLAYER_DIR := $(ROOT_DIR)/apps/vibee-editor/player
RENDER_DIR := $(ROOT_DIR)/apps/vibee-editor/render

NODE ?= node
NPM ?= npm
BUN ?= bun
COMPOSE ?= docker compose

.PHONY: help doctor install install-root install-player install-render \
	dev-bot dev-player dev-render compose-up compose-down compose-status \
	test test-root test-player test-render test-safe-beta test-e2e-safe-beta \
	test-supabase-exit verify-supabase-exit-app \
	test-root-migration-contract verify-root-migration-contract \
	typecheck typecheck-root typecheck-player typecheck-render \
	build build-root build-player build-render \
	audit audit-root audit-player audit-render remotion-versions \
	security-scan diff-check tri-regress tri-selftest verify-editor verify

help: ## Show the supported local and release commands.
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-24s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

doctor: ## Validate required runtimes without reading or printing secrets.
	@command -v $(NODE) >/dev/null
	@command -v $(NPM) >/dev/null
	@command -v $(BUN) >/dev/null
	@major="$$($(NODE) -p 'process.versions.node.split(`.`)[0]')"; \
	  case "$$major" in 20|21|22) ;; *) echo "Node 20-22 required; found $$($(NODE) --version)" >&2; exit 1 ;; esac
	@$(NPM) --version >/dev/null
	@$(BUN) --version >/dev/null
	@echo "doctor: PASS (Node $$($(NODE) --version), npm $$($(NPM) --version), Bun $$($(BUN) --version))"

install: install-root install-player install-render ## Install every lockfile reproducibly.

install-root: ## Install the Telegram bot workspace from bun.lock.
	@cd $(ROOT_DIR) && $(BUN) install --frozen-lockfile

install-player: ## Install the Mini App, copying its local atoms dependency.
	@cd $(PLAYER_DIR) && $(NPM) ci --install-links

install-render: ## Install the render/MCP service from its lockfile.
	@cd $(RENDER_DIR) && $(NPM) ci --install-links

dev-bot: ## Start the root Telegram service in watch mode; never kills ports.
	@cd $(ROOT_DIR) && $(BUN) --watch src/index.ts

dev-player: ## Start the Mini App on loopback; never kills ports.
	@cd $(PLAYER_DIR) && $(NPM) run dev -- --host 127.0.0.1

dev-render: ## Start render/MCP using the current environment; never kills ports.
	@cd $(RENDER_DIR) && $(NPM) run start

compose-up: ## Start the declared Docker Compose stack.
	@cd $(ROOT_DIR) && $(COMPOSE) up -d

compose-down: ## Stop the declared Docker Compose stack.
	@cd $(ROOT_DIR) && $(COMPOSE) down

compose-status: ## Show Docker Compose status.
	@cd $(ROOT_DIR) && $(COMPOSE) ps

test: test-root test-player test-render ## Run all unit suites.

test-root: ## Run root Vitest once with inert test credentials.
	@cd $(ROOT_DIR) && SUPABASE_URL=TEST_URL SUPABASE_SERVICE_KEY=TEST_KEY $(BUN) run vitest run

test-player: ## Run all Mini App unit tests once.
	@cd $(PLAYER_DIR) && $(NPM) exec -- vitest run

test-render: ## Run all render/MCP unit tests once.
	@cd $(RENDER_DIR) && $(NPM) exec -- vitest run

test-safe-beta: ## Run the focused auth, identity, MCP and immutable-lock suites.
	@cd $(RENDER_DIR) && $(NPM) exec -- vitest run \
		auth.test.ts \
		src/profile/verifiedProfile.test.ts \
		src/profile/profileOwnershipSource.test.ts \
		src/agent/safe-beta.test.ts \
		src/runtime/safeBeta.test.ts
	@cd $(ROOT_DIR)/apps/vibee-editor/packages/vibee-atoms && \
		$(RENDER_DIR)/node_modules/.bin/vitest run \
		--config ../../render/vitest.config.ts --root . \
		src/telegram-auth.test.ts src/__tests__/agent-policy.test.ts
	@cd $(PLAYER_DIR) && $(NPM) exec -- vitest run \
		src/atoms/clientSafeBeta.test.ts \
		src/atoms/telegramIdentity.test.ts \
		src/atoms/telegramIdentitySource.test.ts \
		src/components/Auth/TelegramLoginButton.test.tsx \
		src/config/safeBeta.test.ts \
		src/lib/__tests__/clientSafeBetaArtifact.test.ts \
		src/lib/__tests__/legacyPaidHandlersSafeBeta.test.ts \
		src/pages/Chat.safe-beta.test.ts

test-e2e-safe-beta: ## Verify Agent/header geometry at 390, 720 and 1024px on an isolated port.
	@cd $(PLAYER_DIR) && $(NPM) run test:e2e:safe-beta

test-supabase-exit: ## Prove the player/render lane has no Supabase runtime or egress.
	@cd $(ROOT_DIR) && $(NODE) --test scripts/tests/player-entrypoint-supabase-guard.test.mjs
	@cd $(ROOT_DIR) && $(NODE) scripts/tests/supabase-exit-runtime.test.mjs
	@cd $(RENDER_DIR) && $(NPM) exec -- vitest run \
		auth.test.ts \
		src/runtime/supabaseExit.test.ts \
		src/storage/mediaProxy.test.ts \
		src/templates/registry.test.ts
	@cd $(PLAYER_DIR) && $(NPM) exec -- vitest run \
		src/atoms/serverTemplates.test.ts

verify-supabase-exit-app: test-supabase-exit typecheck-player typecheck-render build-player build-render security-scan diff-check ## Verify the independently releasable player/render migration lane.
	@cd $(ROOT_DIR) && $(NODE) scripts/tests/supabase-exit-runtime.test.mjs --require-artifacts

test-root-migration-contract: ## Run the additive, offline-only root migration contracts.
	@cd $(ROOT_DIR) && $(NODE) --test \
		scripts/tests/supabase-exit-backup-contract.test.mjs \
		scripts/tests/root-relational-pgservice-extract.test.mjs \
		scripts/tests/root-relational-reconciliation.test.mjs \
		scripts/tests/storage-object-manifest.test.mjs \
		scripts/tests/storage-object-ledger.test.mjs \
		scripts/tests/storage-object-copy.test.mjs
	@cd $(ROOT_DIR) && for file in \
		scripts/migrations/root-relational/*.cjs \
		scripts/storage-migration/*.cjs; do $(NODE) --check "$$file"; done

verify-root-migration-contract: doctor test-root-migration-contract security-scan diff-check ## Verify only the non-networking root migration primitives; never copies production data.

typecheck: typecheck-root typecheck-player typecheck-render ## Type-check every application.

typecheck-root: ## Type-check the root Telegram service.
	@cd $(ROOT_DIR) && $(BUN) run typecheck

typecheck-player: ## Type-check the Mini App.
	@cd $(PLAYER_DIR) && $(NPM) exec -- tsc -b --pretty false

typecheck-render: ## Type-check render/MCP in strict mode.
	@cd $(RENDER_DIR) && $(NPM) exec -- tsc --noEmit

build: build-root build-player build-render ## Build every production artifact.

build-root: ## Build the root Telegram service.
	@cd $(ROOT_DIR) && $(BUN) run build

build-player: ## Build the static Mini App bundle.
	@cd $(PLAYER_DIR) && $(NPM) run build

build-render: ## Bundle the Remotion compositions.
	@cd $(RENDER_DIR) && $(NPM) run build

audit: audit-root audit-player audit-render ## Audit all installed dependency graphs.

audit-root: ## Audit root dependencies.
	@cd $(ROOT_DIR) && $(BUN) audit

audit-player: ## Audit Mini App build and runtime dependencies.
	@cd $(PLAYER_DIR) && $(NPM) audit

audit-render: ## Audit render/MCP dependencies.
	@cd $(RENDER_DIR) && $(NPM) audit

remotion-versions: ## Prove every Remotion package and Zod version is aligned.
	@cd $(RENDER_DIR) && $(NPM) exec -- remotion versions
	@cd $(PLAYER_DIR) && $(RENDER_DIR)/node_modules/.bin/remotion versions

security-scan: ## Scan the candidate tree for credential patterns.
	@cd $(ROOT_DIR) && ./scripts/security-token-guard.sh tree

diff-check: ## Reject whitespace errors in the candidate diff.
	@cd $(ROOT_DIR) && git diff --check

tri-regress: ## Run the repository-native regression gate when tri is installed.
	@command -v tri >/dev/null || { echo "tri is required" >&2; exit 1; }
	@cd $(ROOT_DIR) && tri regress

tri-selftest: ## Run the repository-native CLI self-test when tri is installed.
	@command -v tri >/dev/null || { echo "tri is required" >&2; exit 1; }
	@cd $(ROOT_DIR) && tri selftest

verify-editor: doctor test-safe-beta test-player typecheck-player typecheck-render build-player build-render test-e2e-safe-beta remotion-versions audit-player audit-render security-scan diff-check ## Verify SAFE BETA editor/render.

verify: doctor test typecheck build remotion-versions audit security-scan diff-check tri-regress tri-selftest ## Run the complete release gate; any failure blocks release.
