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
12. Питон-вставки в ts-файлы (replace-склейки) рвут синтаксис на стыках: после каждой — tsc --noEmit по конкретному файлу и просмотр стыка. Ловится за минуту, без проверки уезжает в рестарт.
13. Файловый state.json автопилота: при смене даты обнуляй ТОЛЬКО счётчик постов — nextTopic и lastPostAt обязаны переживать ночь, иначе утро уходит на прокрутку дублей.
14. loop/regression-check.sh — первый шаг каждого витка: полный аудит без платных вызовов. Провал любой строки = приоритет витка.
15. УТРЕННИЕ ВИТКИ (первые два после 00:00 UTC): обновляй сводку — cd apps/vibee-editor/render && LOOP_DIR=<repo>/loop AGENT_KEYS="$(railway variables list -s vibee-render -e production --kv | grep ^AGENT_KEYS= | cut -d= -f2-)" SELF_URL=http://127.0.0.1:3333 npx tsx scripts/morning-summary.ts — владелец читает loop/MORNING.md одним файлом.
16. Merge ветки цикла с main конфликтует в LOOP_REPORT.md (append-only файлы): дописывай разделы ТОЛЬКО в конец и проверяй пункт плана после каждого merge.

## Опыт ZCode-сессии 24.08 (день, поверх ночных циклов)

16. **Mimosa-калибровка** (куплено ~20 блоками коммитов): (а) пре-коммит L3 при полном прогоне блокирует ЛЮБОЙ коммит, касающий render/\*, пока в проекте есть high-findings — правь реально, не жди; (б) сканер зачитывает только именованные функции-границы (`assertFetchable` перед fetch; `sendJson` для ответов; `runFfmpeg/runFfprobeText` для exec — execFileSync живёт ТОЛЬКО внутри них, вызовы сайтов передают массив аргументов); (в) инлайн-проверки рядом с sink НЕ зачитываются; (г) эхо удалённого/ошибок в ответ — под запрет (константы в ответ, детали в console.error); (д) env-URL во фронтенд-файлах — только литерал (бот-файлы), в render-server — санитайзер-переменная. L2-стопхук после ответа показывает ПРАВДУ про реальные diff-строки — чинить по нему быстро и реально.
17. **Звёзды Telegram вместо лайков** (PR #616/#620): контурная звезда (fill=none) до первой оплаченной юзером звезды, потом золотая; is_starred = LEFT JOIN template_stars (from+paid); самолайк запрещён; двойной тап звезду НЕ шлёт. Полная петля оплаты проверяется только живым вторым Telegram-аккаунтом.
18. **SSRF-гварды** (PR #624): URL из ответа внешнего API → assertFetchable перед fetch; перекладка в S3 — ПРЯМОЙ uploadToS3 в процессе, не HTTP к SELF_URL.
19. **tri CLI v2** (~/.local/bin/tri): подкоманды status/regress/morning/loop/feed/chat/selftest ускоряют виток до секунд; дефолт без аргументов — прежний railway-ssh-claude.
20. **Координация двух лупов**: контент-луп (этот скилл, автопилот) трогает loop/_ и рендер-скрипты; продуктовый луп ZCode — player/_, дизайн, исследования, security. Оба: регресс-чек первым, state.json автопилота руками НЕ переписывать, коммиты в свои ветки, прод — только с добра владельца.
21. **Схема звёзд vs SELECT** (прод-инцидент 24.08, лента 500 ~1ч): GET /api/feed делает LEFT JOIN template_stars — таблицу создавал ТОЛЬКО POST /:id/star, до которого прод не дошёл. Правило: любая таблица/колонка, на которую ссылается частый SELECT, создаётся ленивым ensure В САМОМ GET (идемпотентно). Регресс-чек обязан иметь живой GET частых маршрутов (добавлен: локаль + REGRESS_PROBE_PROD=1).
22. **railway CLI под чужим аккаунтом** (24.08): whoami = Mina (oxicocicate35@gmail.com), проекты владельца недоступны → variables list пусто за 14с. Старт-локал падал тихо с пустыми DATABASE_URL/AGENT_KEYS («работал» health-ом, отдавая 500). Правила: в скриптах сначала `railway whoami` + ретраи переменных (сделано в start-render-local.sh) и громкий exit при пустых критичных; ключ локального дев-теста всегда есть в apps/vibee-editor/player/.env.local (VITE_AGENT_KEY). Локальный стек поднимется после re-login владельца.
23. **Холодный старт прода после волн деплоев**: латентность /api/feed растёт до 5–7с на ~30 мин после серии мерджей, затем сама опускается до 0.5с (замерено 24.08, витки №3→№4). Не поднимать инфра-панику: зафиксировать в отчёте, перепроверить следующим витком; алертить владельца только если >5с держится дольше часа.
24. **regression-check.sh — zsh-скрипт** (в шебанге): виток, позвавший его `bash …`, получал syntax error на EOF — системный bash 3.2 не парсит zsh-синтаксис. Теперь скрипт сам перезапускает себя zsh'ем (`exec zsh "$0"`), звать можно любым интерпретатором (24.08, виток №63).
25. **Локальный warn-режим пускает платные POST /api/generate/*** БЕЗ ключа — Replicate-траты реальные (общий токен канала: ~$0.10 seedance-видео, ~$0.003 flux-картинка). Не дёргать эти маршруты curl'ом без X-Api-Key; прод-гвард (enforce) анониму отдаёт 401 — проверено живым POST video+image 24.08. Плеерная страница Generate обязана слать подпись (authHeaders() в generateApi.ts, PR #657), иначе 401 «из ниоткуда» — это та же ловушка №8, но на клиенте.
26. **Вебхук кассира и BOT_TOKEN_12 — один и тот же бот** (@t27ai_bot): прод-бэкенд ботов держит его в long polling и молча перебивает setWebhook (getWebhookInfo → url пуст). Не ставить вебхук вхолую: зачисление звёзд живёт через POST /api/tokens/verify (getStarTransactions, атомарное redeemed) + авто-verify при входе в чат и retry 3×25с после оплаты (цикл №64). Вебхук оживёт только если владелец уберёт бота из BOT_TOKEN_* бэкенда.
