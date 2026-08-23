---
name: trinity-agent-ops
description: Эксплуатация Trinity S³AI (vibee-editor): локальный запуск стека, ключи, ловушки агента и протокол автономного цикла улучшений. Использовать при любой работе с агентом, рендером, лентой или крон-циклом в 999-multibots-telegraf.
---

# Trinity S³AI — эксплуатация агента и автономного цикла

## Стек и адреса (локально)

- Мини-апп (лента+агент): http://localhost:5173 — `apps/vibee-editor/player`, Vite 7, запускать нодой ≥20 (`/opt/homebrew/bin/node` v23; системный nvm-нод v18 НЕ подходит).
- Render-сервер (API ленты, MCP агента, рендер): http://localhost:3333 — `apps/vibee-editor/render`, запуск `loop/start-render-local.sh` (тянет живые env из Railway CLI: база через публичный прокси Postgres-NFrq, ключи vibee-render + REPLICATE_API_TOKEN из 999-multibots-telegraf).
- Бэкенд ботов: http://localhost:2999 — `INFISICAL_CLIENT_ID=dummy INFISICAL_CLIENT_SECRET=dummy INFISICAL_PROJECT_ID=dummy bun run dev` (заглушки включают fallback на локальный .env).
- Карточка агента: `GET localhost:3333/mcp`; вызовы: `POST /mcp` с заголовком `X-Agent-Key` (значение — Railway vibee-render → AGENT_KEYS, формат `ключ:telegramId`). Ключ НЕ логировать.

## Опыт, купленный ошибками (не повторять)

1. **FAL, ElevenLabs, OpenAI, GLM-ключ бэкенда мертвы** (баланс/инвалид). Живые: **Replicate** (картинки, flux-schnell) и OpenRouter. `/api/generate/image` уже имеет Replicate-fallback с поллингом (Prefer: wait у Replicate НЕ гарантирует готовность — дозапрашивай `urls.get`).
2. ElevenLabs-ключ на проде — это key ID, а не ключ: `/api/voices` возвращает пустоту. Озвучка недоступна, пока владелец не выдаст настоящий `sk_`.
3. `video_generate` сломан вдвойне: дефолт `MCP_URL` указывает на сам рендер-сервер, а запрос к `/mcp` уходит без `X-Agent-Key`. Чинить только парой: правильный URL бэкенда + ключ.
4. Remotion-бандл локально падал на jotai: `@vibee/atoms` в node_modules — симлинк, webpack резолвит по реальному пути. Лечится `resolve.symlinks: false` в `initBundle` (уже в коде).
5. `bun install` в корне репо падает на prepare-hook (lefthook vs husky). Обход: `bun install --ignore-scripts`.
6. Системный нод — v18 (nvm), для player/render нужен ≥20: всегда `export PATH="/opt/homebrew/bin:$PATH"`.
7. В render-server 383 прекоммитных ошибки типов tsc — не твоих рук дело; проверяй только свои файлы.
8. Общесистемный guard POST-маршрутов режет новые эндпоинты — публичные POST нужно явно выводить из-под guard (как `/mcp`), иначе 401 «из ниоткуда».

## Автономный цикл (крон каждые 15 минут)

- Состояние: `loop/state.json` (посты за день, индекс темы), очередь тем `loop/topics.json`, журнал `loop/LOOP_STATE.md` (append-only). Отчёты: `loop/LOOP_REPORT.md`.
- Автопилот: `cd apps/vibee-editor/render && LOOP_DIR=<repo>/loop npx tsx scripts/agent-autopilot.ts` — сам рендерит и публикует рилс из очереди. Лимиты: 4 поста/день, 60 платных генераций/день (в tools.ts), дубль-защита по названию.
- **Не ломать прошлую работу**: не `git reset/checkout` без stash, не убивать порты 2999/3333/5173 (сначала health-check `curl localhost:3333/health`), не переустанавливать deps без нужды, коммитить только в ветку `loop/agent-improvements`, в main не лезть, на прод не деплоить без явного разрешения владельца.
- Перед правками агентских инструментов читать `loop/LOOP_REPORT.md` (что уже сделано и что в плане).

9. Блог: прокси GET /api/blog (RSS t27.ai, кэш 10 мин, entity-декод в прокси — браузеру отдаётся чистый текст). Страница pages/Blog.tsx: Header монтируется САМОЙ страницей (App его не ставит), lazy-роуту нужен default export. Таб — NAV_TABS в Header.tsx, переводы tabs.blog в atoms/language.ts (два блока: EN и RU).
10. Автопилот: при <2 тем в запасе сам дописывает в topics.json темы из свежих постов блога (/api/blog). topics.json — мутируемая очередь, не переписывай её руками поверх.
11. Replicate-видео: wan-2.5-t2v-fast стабильно E002 (их сторона) — юзай bytedance/seedance-1-lite (принимает aspect_ratio+duration, НЕ size). Ссылки replicate.delivery и fal — ВРЕМЕННЫЕ: перекладывай файл в S3 через POST /upload сразу.
