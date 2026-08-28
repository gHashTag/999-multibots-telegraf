# ═══════════════════════════════════════════════════════════════════════════
# Trinity S³AI — локальный запуск всего проекта одной командой.
#
#   make setup      — установить зависимости всех частей + создать .env.local
#   make dev        — поднять ВСЁ сразу (агент/A2A + мини-апп + бот), логи в .dev/
#   make stop       — остановить всё
#   make logs       — хвост логов всех сервисов
#   make status     — кто жив и на каком порту
#   make help       — все цели
#
# Секреты — в .env.local (НЕ в гите). Скопируй .env.local.example и заполни.
# ═══════════════════════════════════════════════════════════════════════════
SHELL := /bin/bash
.DEFAULT_GOAL := help

RENDER_DIR := apps/vibee-editor/render
PLAYER_DIR := apps/vibee-editor/player
DEV        := .dev

# Секреты и порты подхватываются из .env.local, если он есть.
ifneq (,$(wildcard .env.local))
  include .env.local
  export
endif

A2A_PORT   ?= 3334
MOCK_PORT  ?= 3336
PLAYER_PORT ?= 5173

.PHONY: help setup env install install-root install-render install-player \
        dev up a2a render render-deps player bot stop down logs status \
        health test typecheck clean docker-up docker-down

help: ## показать все цели
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	 | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Установка ───────────────────────────────────────────────────────────────
setup: env install ## первый запуск: .env.local + зависимости всех частей

env: ## создать .env.local из примера, если его нет
	@if [ ! -f .env.local ]; then cp .env.local.example .env.local; \
	  echo "→ создан .env.local — ЗАПОЛНИ секреты (DATABASE_URL, RENDER_API_KEY, GLM_API_KEY, AGENT_KEYS)"; \
	 else echo "→ .env.local уже есть"; fi

install: install-root install-render install-player ## зависимости всех частей
install-root: ; @echo "→ bot deps"; npm install --no-audit --no-fund
install-render: ; @echo "→ render deps"; cd $(RENDER_DIR) && npm install --no-audit --no-fund
install-player: ; @echo "→ player deps"; cd $(PLAYER_DIR) && npm install --no-audit --no-fund

# ── Запуск всего разом ──────────────────────────────────────────────────────
dev up: stop ## поднять ВСЁ сразу (агент/A2A + мини-апп + бот) в фоне
	@mkdir -p $(DEV)
	@echo "→ агент/A2A на :$(A2A_PORT)"
	@cd $(RENDER_DIR) && A2A_PORT=$(A2A_PORT) SELF_URL=http://localhost:$(A2A_PORT) \
	  nohup npx tsx a2a-local.ts > ../../../$(DEV)/a2a.log 2>&1 & echo $$! > $(DEV)/a2a.pid
	@echo "→ мини-апп на :$(PLAYER_PORT)"
	@cd $(PLAYER_DIR) && nohup npm run dev -- --port $(PLAYER_PORT) > ../../../$(DEV)/player.log 2>&1 & echo $$! > $(DEV)/player.pid
	@echo "→ бот"
	@nohup npm run dev > $(DEV)/bot.log 2>&1 & echo $$! > $(DEV)/bot.pid
	@sleep 3; $(MAKE) --no-print-directory status
	@echo "Логи: make logs · Стоп: make stop"

a2a: ## только агент/A2A-харнесс (render без Remotion/face-api) на :$(A2A_PORT)
	@cd $(RENDER_DIR) && A2A_PORT=$(A2A_PORT) SELF_URL=http://localhost:$(A2A_PORT) npx tsx a2a-local.ts

mock: ## MOCK-сервер: эмуляция ВСЕХ функций (генерация/MCP/A2A/лента) на :$(MOCK_PORT)
	@kill $$(lsof -ti:$(MOCK_PORT) 2>/dev/null) 2>/dev/null || true
	@cd $(RENDER_DIR) && MOCK_PORT=$(MOCK_PORT) npx tsx mock-server.ts

render: ## полный рендер-сервер (нужен face-api: сперва make render-deps)
	@cd $(RENDER_DIR) && npm run start

render-deps: ## досборка нативной зависимости рендера (@tensorflow/tfjs-node)
	@cd $(RENDER_DIR) && npm rebuild @tensorflow/tfjs-node || \
	  echo "не собралось — рендер лица недоступен локально, агент/A2A работают через make a2a"

player: ## только мини-апп (Vite) на :$(PLAYER_PORT)
	@cd $(PLAYER_DIR) && npm run dev -- --port $(PLAYER_PORT)

bot: ## только Telegram-бот
	@npm run dev

# ── Управление ──────────────────────────────────────────────────────────────
stop down: ## остановить всё, поднятое через make dev
	@for p in $(DEV)/*.pid; do [ -f "$$p" ] && kill $$(cat "$$p") 2>/dev/null && echo "убит $$(basename $$p .pid)"; rm -f "$$p"; done; true

logs: ## хвост логов всех сервисов
	@tail -n 40 -f $(DEV)/*.log

status: ## кто жив и на каком порту
	@for s in a2a player bot; do \
	  if [ -f $(DEV)/$$s.pid ] && kill -0 $$(cat $(DEV)/$$s.pid) 2>/dev/null; \
	    then echo "  ✅ $$s (pid $$(cat $(DEV)/$$s.pid))"; else echo "  ⭕ $$s не запущен"; fi; done
	@curl -s -m 3 http://localhost:$(A2A_PORT)/.well-known/agent-card.json >/dev/null 2>&1 \
	  && echo "  ✅ A2A card: http://localhost:$(A2A_PORT)/.well-known/agent-card.json" \
	  || echo "  ⭕ A2A card ещё не отвечает"

health: ## быстрая проверка A2A-карточки локально
	@curl -s http://localhost:$(A2A_PORT)/.well-known/agent-card.json | \
	  python3 -c "import sys,json;d=json.load(sys.stdin);print('name:',d['name'],'| skills:',len(d['skills']))" 2>/dev/null \
	  || echo "A2A не отвечает — make a2a"

test: ## тесты рендера
	@cd $(RENDER_DIR) && npm test
typecheck: ## типы всех частей
	@npm run typecheck; cd $(RENDER_DIR) && npx tsc --noEmit -p tsconfig.json

clean: stop ## остановить всё и убрать логи
	@rm -rf $(DEV)

# ── Docker (прежние цели сохранены) ─────────────────────────────────────────
docker-up: ; docker-compose up -d
docker-down: ; docker-compose down
