# CRM: состояние цикла улучшений

Единственная память между витками крона. Читай ПЕРВЫМ делом, пиши В КОНЦЕ витка.

## ⛔ ЧТОБЫ НОВЫЙ ВИТОК НЕ СЛОМАЛ ПРОШЛУЮ РАБОТУ

Крон стоит на `7,22,37,52 * * * *` (каждые 15 мин, job f0ee9fda, с 16.09.2026).
Виток короче, чем большинство задач. Правила, выведенные из этого:

1. **Сначала прочитай «СЕЙЧАС В РАБОТЕ» ниже.** Если там стоит задача и она не
   твоя — НЕ начинай её заново. Возьми следующую из плана.
2. **Ветка одна.** Не создавай новую ветку, если в «СЕЙЧАС В РАБОТЕ» уже
   названа. Две ветки на одну задачу — это конфликт, который потом разбирать
   владельцу.
3. **Коммить часто и мелко.** Виток может кончиться в любой момент; всё, что
   не закоммичено, следующий виток не увидит и, вероятно, сделает заново.
4. **Никогда не откатывай чужой коммит.** Если кажется, что предыдущий виток
   сделал неверно, — напиши это в отчёт, а не `git revert`.
5. **Не сливай PR без слова владельца.** Он спит; слияние необратимо.
6. **Перед началом:** `git pull --ff-only` и `git log --oneline -5`. Чужие
   сессии льют в main параллельно (см. память `concurrent-sessions-on-main`).

## СЕЙЧАС В РАБОТЕ

- ветка: `fix/reel-text-and-file-reading` (PR #2414, ОТКРЫТ)
- аудит слабых мест ЗАВЕРШЁН (workflow `ws9ccnsff`, 12 агентов): 21 находка
  выжила, 4 убиты. Полный разбор: `/private/tmp/claude-501/.../ws9ccnsff.output`
  (файл сессионный — если его нет, список ниже единственный источник).

### План цикла 8 — по находкам аудита

- [x] Время касания = время события (`985ac6b17`). `recordTouch` принимает `at`.
- [x] Наш собственный автоответ пишет касание `written` (`985ac6b17`). Чинит
      «ours навсегда».
- [x] `stageOf` получает историю, а не одну строку (`c274bf2bc`) — в
      `crm_summary` и `crm_leads`.
- [x] `note` перестал притворяться последним действием (`c274bf2bc`).
- [x] **Ответ ИИ поверх перехвата владельцем** — ПОЧИНЕНО. Пауза
      перечитывается ПОСЛЕ того, как ответ составлен, и ДО отправки; ход
      выбрасывается, а не ставится в очередь (он собран без реплики владельца
      в истории). Тест проверяет сам порядок, не текст комментария.
- [x] **Фото не попадало в зеркало** — ПОЧИНЕНО.
      `sendFileWithAddressBook` была `Promise<void>` и теряла отправленное
      сообщение. Подделки `sendFile`/`sendMessage` в тесте теперь ВОЗВРАЩАЮТ
      сообщение, как Telegram: без этого правка осталась бы непроверяемой
      (скептик предупредил заранее, и был прав).
- [x] **«Платил ли человек» читает ОБЕ книги** — ПОЧИНЕНО. `платившие()`
      берёт необязательный пул и объединяет архив `payments_v2` с живой
      `star_payments` (строка на списание, в той же транзакции, что двигает
      баланс). Объединяет, а не заменяет: потерять годы плательщиков — тот
      же дефект наоборот. Молчащая живая книга не стирает ответ архива.
- [ ] СРЕДНЕЕ. Счёт бота фермы невозможно погасить: `redeemed` ставит только
      `/api/tokens/verify`.
- [ ] СРЕДНЕЕ. `recordTurns` в личке вызывается наоборот.
- [ ] СРЕДНЕЕ. Альбом фото: клиент получает N одинаковых ответов, всегда
      по-русски.
- [ ] СРЕДНЕЕ. «не нужно»/«не хочу» считаются сигналом покупки.
- [ ] СРЕДНЕЕ. `/sweep` с фильтром смотрит верхние 50 и молча говорит
      «никого нет».
- [ ] СРЕДНЕЕ. Память личек пишется на одного владельца, читается на другого.
- [x] **Канарейка владельца покрывает ВСЕ crm-инструменты** — ПОЧИНЕНО.
      `crm_deliver_photo` собирается фабрикой и не входил ни в один из пяти
      реестров; у `crm_offer` в ARGS стоял `telegram_id` вместо `chat`, и без
      него снятие `requireOwner` уводило в ветку без утечки — мутация выживала.
      Добавлен шестой реестр, ключи исправлены, и теперь падает сам ДРЕЙФ:
      инструмент с обязательным параметром без записи в ARGS или запись без
      инструмента роняют прогон.
- [ ] СРЕДНЕЕ. `crm-replies.ts`: подделки в тестах отвечают за SQL (форма 21).
- [ ] НИЗКОЕ. У механизма отмены касания (`reverts_id`) нет писателя.
- [ ] НИЗКОЕ. Дневной лимит не применяется; посегментный во второй копии.
- [ ] НИЗКОЕ. Сегмент `warm` считается, но действовать по нему нечем.
- [ ] НИЗКОЕ. Ключи `/api/agent/keys` не работают на `/a2a`.
- [x] `crm-owner-gate.test.ts` больше не слеп для `crm_offer` (там же).

## Что уже есть (замерено, не на глаз)

`apps/vibee-editor/render/src/agent/crm-tools.ts`, 367 строк, три инструмента:
`crm_overview`, `crm_hot_leads`, `crm_winback`. Видимость — через
`hive/roles.ts` (`visibilityOf`, `botFilter`): каждый владелец видит только
своих людей. Тесты: `crm-tools.test.ts`.

Живой замер продакшена 08.09.2026 (через `/mcp`, ключ из Railway):
2380 человек, 327 платящих (13.7%), пришли за 7 дней — **7**, за 30 — **49**.

## ГЛАВНОЕ СЛАБОЕ МЕСТО (найдено 08.09.2026)

**CRM не пишет ничего.** `grep -c "INSERT|UPDATE|CREATE TABLE" crm-tools.ts` = **0**.
Ни одной таблицы про касание лида во всём репозитории.

Что это значит на практике: открыл горячих лидов, написал пятерым — завтра те
же пятеро снова в списке, потому что ничто не помнит, что им уже писали.
Пишешь второй раз. Это самый быстрый способ получить блокировку аккаунта и
раздражить клиента.

Форма дефекта та же, что была у `tg_send`: одна половина сделана хорошо и
поэтому выглядит законченной. Отчёт — не CRM.

## План (декомпозиция)

- [x] **1. Память касаний.** СДЕЛАНО, PR #2171. `crm_touches` в Railway
      Postgres, `crm_touch` (запись), `crm_history` (что уже делали),
      `crm_hot_leads` откладывает тронутых за 30 дней и НАЗЫВАЕТ число.
      8 мутаций убиты. Новый код целиком по-английски, в отдельном файле
      `crm-touch-tools.ts` — старый `crm-tools.ts` на русских именах, и
      смешивать нельзя.
- [x] **2. Кто ждёт меня.** СДЕЛАНО. `crm_waiting`: ours (ответил, мы молчим —
      первым), theirs, due. Считается ТОЛЬКО из касаний, сессия Telegram не
      нужна.
- [x] **3. Стадии.** СДЕЛАНО. `crm-stages.ts`: стадия выводится из денег и
      касаний, руками не ставится. Деньги перебивают всё; отказ перебивает
      всё, кроме денег; «купил» без платежа в леджере — НЕ клиент.
- [x] **5. Экран CRM в мини-аппе.** СДЕЛАНО. `/crm`, идёт через те же
      инструменты `/mcp` — второго источника правды нет. Текст в словаре,
      ключи сервера переводятся один раз в `lib/crm.ts`.
- [x] **4. Стратегия продаж.** СДЕЛАНО. `crmPlan.ts` + `crmProactive.ts`:
      продавец сам предлагает день — очередь карточек, одна за раз, нажатие
      владельца двигает её дальше. Максимум в день ограничен сегментами
      (`crm-segments.ts`, лимиты на сегмент), не рассылкой.

> ⚠️ 16.09.2026: здесь лежали ДУБЛИ пунктов 2, 3 и 5 — те же задачи ещё раз,
> но непомеченными. `tri loop` показывал их как «не сделано», и виток крона
> взялся бы переписывать готовое. Дубли удалены. Урок общий: в этом файле
> пункт живёт в ОДНОМ экземпляре, статус меняется на месте, второй копии
> задачи быть не должно.

## Границы (не нарушать)

- Никакой массовой рассылки. Одно сообщение = одно подтверждение кнопкой.
  Механизм уже есть: `tg-proposals.ts` + карточка в боте + одноразовый секрет.
- Записывать касание — можно (это не действие наружу). Отправлять — только
  через подтверждение.
- Видимость только через `hive/roles.ts`. Второй источник владения разойдётся
  с первым.

## Известные грабли этого репозитория

- `no-cyrillic` сторож не видит внутрь **регулярок** — кириллица в `/.../`
  проходит мимо строковых литералов и блокирует коммит. Используй `.includes()`.
- prettier снимает кавычки с ключей объекта, и `{ 'тип': … }` превращается в
  `{ тип: … }` — сторож ловит. Нужен маркер `cyrillic-ok` на строке.
- Сообщение коммита — только ASCII (`no-cyrillic-in-message`).
- **`tsc -p tsconfig.json` в плеере НИЧЕГО не проверяет** (`files: []`,
  project references). Настоящая: `tsc -p tsconfig.app.json`. Я на этом
  пропустил 4 настоящие ошибки типов.
- `npx vitest` на node 18 падает с ERR_REQUIRE_ESM. Всегда
  `export PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH"`.
- GitHub Actions мертвы по биллингу — красные галочки в PR это НЕ твоя правка.
  Сигнала от CI нет вовсе, проверяй локально.
- Railway деплоит только `main`; бот — на любой push, render — только при
  изменениях в `apps/vibee-editor/render/**`.

## Две живые базы — важно

Замер 08.09.2026 (`tri crm-source`, команда добавлена в этом витке):

    users        railway   2376 (6d)    supabase   2380 (1d)    свежее: supabase
    payments_v2  railway  17139 (12d)   supabase  17140 (0d)    свежее: supabase

`users` и `payments_v2` лежат ДВАЖДЫ. Бот пишет в облачный Supabase; копия в
Railway — застрявшая миграция, платежи отстают на 12 дней. `crm-tools.ts`
читает Supabase, и сегодня это ПРАВИЛЬНО. Не переводи CRM на Railway, пока
`tri crm-source` не скажет, что свежее там: иначе инструмент продаж покажет
позапрошлую выручку.

Владелец сказал «у нас все на railway» — по инфраструктуре так и есть, но по
этим двум таблицам замер говорит иначе. Новое (`crm_touches`) кладём в Railway.

## Что не удалось

- **WebSearch не работает** (08.09.2026): «There's an issue with the selected
  model (glm-4.5-air)». Исследование конкурентов по вебу в этом витке не
  выполнено. Не выдумывай его результаты — либо повтори попытку, либо честно
  напиши, что не сделано.

## Виток 2 — 08.09.2026, ночь (владелец спит)

Сделано и в `main` (PR #2171, задеплоено, проверено на проде: 4 инструмента CRM
в `/mcp`, `crm_waiting` отвечает, чанк `Crm-*.js` в бандле, оба сервиса 200):

- `crm_waiting` — кто ждёт ответа: ours / theirs / due, ours первым.
- стадии из фактов (`crm-stages.ts`): деньги > отказ > касания; «купил» без
  платежа — НЕ клиент.
- экран CRM в мини-аппе `/crm`, через те же инструменты `/mcp` (один источник
  правды о видимости).

В PR #2215 (ветка `feat/personal-seller`, проверка перед мержем идёт):

- **личный продавец** `crm_offer`: @username → id через сессию владельца →
  Stars-инвойс НА id лида (`tokens:N:<lead>`, бот уже зачисляет по нему) →
  питч со ссылкой → proposal → карточка «Отправить/Отмена» в боте.
- минтинг вынесен в `token-invoice.ts`; касса мини-аппа делегирует ему.
- подтверждённая отправка пишет касание `written` на сервере.

Решение по продукту (владелец не спрашивался — спал; сказано в отчёте):
«оплатить в личке» = ССЫЛКА на инвойс бота, потому что пользовательский
аккаунт инвойс выставить не может. Доставка услуг прямо в личку (агент
генерирует и отправляет в DM) — следующий виток, не этот.

Первое письмо @pilot_client: **я его не отправляю.** Владелец в боте пишет
«предложи @pilot_client 50 токенов под рилсы» → карточка → «Отправить».
@pilot_client нет в 30 последних диалогах владельца — разговора ещё не было.

Найдено чужое и починено по пути: тест `robokassa-result-url-is-mounted`
падал на любой машине с `.env` (dotenv возвращает удалённые переменные при
реимпорте) и блокировал пуш; проходил только в CI. Пустая строка вместо
удаления — dotenv присутствующие не трогает.

WebSearch по конкурентам — не повторял в этом витке. Всё ещё не сделано.

Следующий виток, по убыванию цены:

1. Доставка услуги в личку: лид в DM просит «сделай фото» → агент
   генерирует и шлёт (с подтверждением владельца). Это и есть «все услуги
   через личную переписку».
2. Имя адресата в карточке вместо числового id (tg_dialogs отдаёт title).
3. `requireOwner` vs новый экран входа: клиент подключил Telegram и не может
   ничем пользоваться.
4. Пять читающих инструментов текут сокетами (6 клиентов, 0 disconnect).

### Два `tri`, и между ними не было моста (найдено в витке 2)

Корневой `tri` (3855 строк) и `bin/tri` (649) — два CLI с одним именем.
Корневой не знал НИ ОДНОЙ команды из `bin/tri`: `crm-source` из витка 1,
`hive`, `feed` — всё отвечало «unknown command». Команды добавлялись честно и
были достижимы только по полному пути. Теперь корневой пробует `bin/tri` и
только на код 64 («не моё») говорит «unknown». Проверяй новую команду через
`./tri <имя>` из корня, а не через `bin/tri`.

Проверка перед мержем PR #2215 нашла 6 дефектов в продавце (касса без базы
не продавала; отрицательный id канала становился чужим положительным; минтинг
до проверки поверхности; и др.) — все починены, 7 обратных мутаций убиты.

## Виток 3 — 08.09.2026, день (владелец проснулся и добавил задач)

Сделано и влито (main, задеплоено Railway):

- #2222 — клиенты с подключённым Telegram получили свои инструменты
  (`requireIdentity` вместо `requireOwner` в пяти читателях и в `propose`);
  пять читателей закрывают сокет (`withClient`); структурный тест искал
  `'await client()'` при коде `client(ctx)` и проходил на пустоте — починен.
  Живой замер: `tri tg-as 987654321` — «принадлежит владельцу» → «не подключён».
- #2226 — имя получателя в карточке рядом с id; отменённый/заменённый/
  истёкший/провалившийся черновик помечает свой счёт (`cancelled_at`).
  Ревизия воркфлоу (20 агентов, 11 подтверждённых) нашла два моих серьёзных:
  бот выбрасывал `display`, пересобирая черновик из пяти полей; фильтр
  `cancelled_at IS NULL` закрыл единственный путь зачисления Stars. Оба и ещё
  пять — починены в том же PR.

Открыто, стек PR (ждут ревизию/мерж):

- #2246 — услуга в личке: `crm_deliver_photo`, списание с получателя ПОСЛЕ
  нажатия и ДО отправки, точный возврат при провале, фото-карточка в боте.
- #2251 — память переписки: `crm_messages` (загрузка через сессию владельца),
  `crm_lead_context`, `crm_leads` (правило записано словами), адаптер Zep Cloud
  v2 за `ZEP_API_KEY`/`ZEP_API_URL`, плейбук продаж в системном промпте,
  `tri crm-ingest`, `tri crm-leads`.
- #2252 — обход без запроса: раз в `CRM_PROACTIVE_MINUTES` (30) бот делает
  один ход агента и кладёт карточку владельцу; удержание до нажатия; не два
  обхода сразу. Живёт в боте: токен бота рендера — не из фермы (хэши не
  совпали), кнопки с него были бы мёртвыми.

Не сделано / вопросы владельцу:

- Zep: на Railway (19 сервисов), у рендера/бота (переменные) и в Infisical
  его НЕТ. Адаптер ждёт `ZEP_API_KEY` (+`ZEP_API_URL` для self-hosted).
  Спросить, где именно он «добавлен на сервер».
- Веб-исследование (документация Zep, практики продаж в Telegram) в этой
  сессии невозможно: WebSearch и классификатор браузера идут через псевдоним
  модели, отображённый в `~/.claude/settings.json` на несуществующую glm.
  Плейбук написан из опыта, адаптер — по документированному REST v2.
- Запрос «прозрачные панели над картой» — не мой (сайт t27.ai в `~/trinity`,
  там работает другой агент); worktree, который я успел создать, удалён.

Уроки в скиллах: blind-guards формы 17–19 (одно написание; заглушка на любой
адрес; прогон мутаций, который ничего не запускал), continuous-improvement-loop
(гвард, переживший своё основание; читатели и сокеты; модели сабагентов).

### Хвост витка 3 — вечер 08.09.2026 (владелец онлайн)

Влито в main: #2246 доставка, #2251 память, #2252 обход, #2253 наша модель
в цепочке, #2255 диалект Zep CE, #2256 порог компактного набора 24k,
#2257 обход перенесён в рабочую точку входа (`src/index.ts`).

Ревизия #2246+#2251 (27 агентов, 19 подтверждённых) → 10 дефектов починены:
двойное списание за картинку (chargeLater), знак суммы в журнале, карточка
без цены для админ-получателя, вытесненный фото-черновик в журнал, тест
возврата с квитанцией≠цене; зеркало Zep только новых, служебные аккаунты
777000/support/deleted — не лиды, правая граница у корней слов, плейбук
только владельцу, 400 у Zep — не «уже есть».

Живой замер:

- `tri crm-ingest 5 20` → 5 диалогов, 1 человек, 20 в память, 20 в Zep CE
  (наш JWT принят); `tri crm-leads` → 900000002 (@pilot_client): «живая переписка»,
  next=wait — честно.
- Наша модель qwen3:1.7b: ход 68 с → 38 с после компактного набора (23 из 63
  инструментов), инструменты зовёт верно, но итоговый текст после инструмента —
  мусор («[[Подпись|can]]»). Продавцу нужна модель ≥8B; переключение назад:
  `railway variables --set AGENT_PROVIDER=zai` на vibee-render.
- Zep CE: Nemotron у NVIDIA не успевал (deadline exceeded на каждом вызове);
  LLM Zep переведён на queen-ollama по приватной сети.

Инцидент: значение ZEP_AUTH_SECRET попало в лог сессии (маскирование sed на
macOS не сработало). Секрет ротирован, файл удалён, рендер получает по ссылке.

Обход в боте: код стартует из `src/index.ts`; первая проводка в `bot.ts` час
не работала — 0 проактивных ходов. Перенесено (#2257), проверка — по логу
`[crm-proactive] started` и маркеру «[проактивный обход продавца]» в истории.

### Из бота, без терминала — 08.09.2026, вечер

#2280: `/model` (текущая модель + кнопки «Наша / Платная / Nemotron / GLM lite»;
выбор хранится на рендере в `agent_settings`, перекрывает `AGENT_PROVIDER`,
переживает рестарт; маршрут `GET/POST /api/agent/provider` — только владелец),
`/leads` (кому писать, из памяти переписки), `/sweep` (обход сейчас; карточка
приходит сюда же). Ревизия воркфлоу для #2280 не запускалась — покрыто 12
тестами и 8 обратными мутациями.

## Cycle 4 — 2026-09-08/09: the name, the cashier, full leads, context first

Merged: #2282 (DM: no tariffs, agent-first), #2284 (name from Telegram; invoice from
the person's own farm bot — bot-farm.ts by getMe), #2287 (/leads full data, /lead
brief, crm_people at ingest), #2288 (render: dmHistoryBlock on surface business,
crm-mirror.ts, POST /api/crm/mirror, ingest after tg connect, `talk` step, no
pay-first prompts), #2289 (bot: ingest on business connection, DM mirror at once,
pay button only with an invoice link, sweep prompt with talk).

Found live: the first pitch said «Ольга» (a fixture name I put in the prompt) and was
SENT by the owner's press 16:35 UTC; its link came from @t27ai_bot. Corrected card:
message 146375 (draft ec95bd68e403, «Pilot, привет!», @Pilot_Client_bot, 30/45⭐).

Owner's stance (2026-09-09): never offer payment first; continue each client's
history with full context; Zep filled immediately. Lessons in memory:
fixture-name-leaked-into-prompt, wife-real-telegram-identity,
farm-cashier-is-the-persons-own-bot, no-pay-first-context-first.

Open: the proactive sweep's first live `talk` draft not yet observed; the pay button
and the DM mirror are verified by tests + deploy, not by a live client message.

## Cycle 5 — 2026-09-09: every dialog, the overview, a menu under every message, the seller aimed

Merged: #2294 (ingest takes every dialog: cap 200 → 2000, connect-time ingests ask for
2000×500, tg_dialogs cap 1000), #2297 (render: crm_summary — the overview; crm-touches
touchesByKind / sellerSendsSince; SELLER_NOTE_PREFIXES in crm-notes.ts, a module nothing
mocks; playbook rule 8 — selective work), #2307 "a menu under every owner message"
(crmMenu.ts grammar `crm:<verb>[:<numeric id>]` / `crm:scope:<preset>`; /crm overview
with scoped-sweep buttons; /leads and /lead keyboards; /sweep <@user | id list |
next=… stage=… signal=… days<=… days>=… paid=… limit=… | ждут | горячие | разговор |
где | stop> as a queue in crmProactive — one card, the owner's press advances, timer
pauses, MENU_HOLD_MS 10 min; DM notification menu for admin owners; pauseAiFor;
history row under proposal cards; follow-up keyboards after tgp presses; hub row under
every owner answer).

Live (crm_summary after the bot PR, 2026-09-09 03:04 UTC): 1009 people known, 855 with
messages, 38 067 messages (20 182 theirs), 125 paid, 316 waiting for the owner's reply,
10 hot; by next: reply 316, offer 7, deliver 2, talk 1, wait 529; the bot PR merged as
#2307 (main eabbc9240). Zep summaries are hallucinated by qwen3:1.7b («Led
Zeppelin» in the wife's summary) — decision on Zep's model left to the owner.

Designs came from two workflows (menus: 10 agents; overview+scope: 7 agents), judged
and synthesized; implementation inline, then reverse mutations (5 caught) and a booted-
Telegraf press test.

Lessons: other sessions merge to main concurrently (#2291–#2296 in an hour) — branch
from fresh main and print push output in full; python edit anchors drift after
prettier — brace-aware replacement must start at the BODY brace, not the return type's;
the no-cyrillic guard blocks Russian in comments, regex literals and Cyrillic object
keys (prettier strips quotes) — use English comments, string `.includes`, and
`Object.fromEntries` for Cyrillic aliases.

Open: the first live scoped sweep (`/sweep ждут`) not yet observed; the pay button and
DM mirror verified by tests and deploy only; crm_leads / scope selections see the top
50 by score — a bigger base needs paging.

## Cycle 6 — 2026-09-09: three Explorers, and the one link that prepares

The owner asked for an Explorer over the SKILLS, in the style of `#/specs` and
bound to the t27 specs; then the same for CRM clients; then for the crons on
Railway, "systematised"; and that only he may see his own data.

Shipped in `gHashTag/trinity` PR #973 (branch
`feat/explorer-tabs-skills-clients-crons`): three tabs on one shared shell
(`explorerTheme`, `ExplorerHeader`, `ExplorerLibrary`, `useHashParams`).

- `#/skills` — 26 published skills of the two PUBLIC repositories, each with
  its `.t27` spec. Forward link declared (`specs:` frontmatter, or the site's
  `bindings.json`); backward link derived at index time and never written into
  a spec. A declared reference that stops resolving fails the build;
  `link-baseline.json` caps the unbound count and may only come down.
- `#/crons` — 33 scheduled jobs read out of the source: 6 Inngest crons, 14
  long-lived timers (bot + render), 12 GitHub Actions schedules, 1 Railway cron
  service. The two schedules on the bot repository are marked as not firing.
- `#/clients` — the owner's CRM. Not in the navigation, `noindex`, no data of
  its own: live `/mcp` calls, refused server-side for anyone but the owner.

Bot side, PR on `feat/crm-prep-deep-link`: `/start crm-prep-<id>` from an admin
in a private chat runs the same `prepare` the menu button runs, so the console's
single action prepares a card and sends nothing; plus `crm-owner-gate.test.ts`,
which asserts every tool in all five CRM registries refuses a stranger BEFORE
touching the database (the pool throws on any query, so read-then-check would
show up as a database error rather than a refusal).

Decisions taken, both reversible with one line and both stated in the PR: the
private bot repository's 45 skills are withheld from the public site (the site
republishes only what is already public); ten trinity skills carry a hardcoded
home directory and were published as they are (already public on GitHub) with a
follow-up task raised to fix them at the source.

A four-agent workflow built and then adversarially verified the two catalogs.
The verification earned its cost: three of ten spec bindings were plausible but
FALSE (a directory-name coincidence, a homonym, and the wrong registry), eight
classes of lying manifest passed both gates, and four guard rails in the cron
scan excused timers by file rather than by line. All fixed.

Lessons: `--experimental-strip-types` needs Node 22, the syncs run on Node 20,
and there is no Chrome on this Mac — the browser audits only run in CI, so
generated text must be marked `data-lang-exempt` by construction rather than
discovered by a local audit. A contract that greps for a literal header name
also catches the comment explaining why the header is banned; keep the rule
literal and reword the comment. And a display bug survives every contract: the
console printed `summary.people` and `summary.messages` when the tool returns
`people_known` and `messages.total` — only reading the tool's own return
statement caught it.

Open: BotFather `/setdomain t27.ai` (owner's action) before the Login Widget
door works; the agent-key door works today. Batch mode (a warm batch under one
press) is designed and not started.

## Цикл 7 — 15–16.09.2026: Telegram API 2026, и пять задач эпика

Владелец: «изучи глубже апи телеграм и новые обновления за этот год и подумай
как еще улучшить crm», затем — делать по одной.

**Обстановка.** За 2026 год вышло СЕМЬ версий Bot API: 9.4 (09.02) … 10.3
(24.08). Telegraf у нас 4.16.3 и знает 7.1 (март 2024) — но это почти нигде не
преграда: сырые вызовы (`businessBotService.ts:408`), сырое middleware
(`:801-823`) и сквозной payload уже работают. Ни один пункт эпика не потребовал
поднимать версию.

**Разбор:** 14 агентов, 25 идей, скептики убили 16. Эпик — issue #2416,
девять дочерних #2418–#2426.

**Сделано (PR #2414, ветка `fix/reel-text-and-file-reading`):**

- [x] Язык ответа (`bfbffd8a4`). Строка «Отвечай по-русски» лежала в ОБЩЕМ
      хвосте `SYSTEM_TEMPLATE`, поэтому клиент в бизнес-личке получал русский
      ответ на любом языке. Источник языка — его собственные слова, НЕ
      `language_code` (это локаль телефона; русскоязычный с английским
      интерфейсом стал бы получать английский).
- [x] Погашенные карточки #2418 (`ace97435b`). `DisabledButton` (10.3).
      ВАЖНО: `disabled` нельзя вместе с `callback_data` — справочник требует
      ровно одно поле-тип. Иначе Telegram отвергает кнопку на каждом нажатии,
      а запасной путь делает отказ неотличимым от старого поведения.
- [x] Подписки #2419 (`dc6d740ef`, `ff34f39b0`, `b81c3f189`). Период только
      2592000, потолок 10000 звёзд. payload `subtokens:<n>:<id>` — без него
      продление не зачисляется. `BotSubscriptionUpdated.state` — canceled /
      active / **failed** (последнее теплее отмены). Защита от двух
      параллельных подписок одному человеку.
- [x] Стриминг ответа владельцу #2420 (`be2cb1f92`). `sendMessageDraft`.
      Клиенту в бизнес-личке НЕ стримим: сырые дельты несут маркеры кнопок.
- [x] Касание `replied` #2426 (`a2b1290de`). Пишется в `mirrorNow` — одна
      воронка. Окно свежести 2 часа: обход не должен штамповать сегодняшнюю
      дату на ответах трёхнедельной давности.
- [x] Управляемые боты #2421 (`545726c15`). Токен читается ОДИН раз, хранится
      в `managed_bots`, ферма его пока НЕ читает (решение владельца).
- [x] Обрыв витка #2423 (`a4a6d4542`). Маршрут рвёт виток при закрытии сокета;
      проверка перед моделью и перед КАЖДЫМ инструментом.
- [x] `tri loop` / `loop-note` / `mutate` / `api` (`46735d1d3`).

**Осталось из эпика:** #2422 (топик под очередь), #2424 (`deleteBusinessMessages`),
#2425 (отсев scam/fake в обходе).

## Конкуренты (замер 16.09.2026, страницы взяты curl-ом)

Четыре разных рынка, и ни один не занимает нашу клетку целиком.

1. **Конструкторы ботов** — salebot.pro, puzzlebot.top, BotHelp. Продают
   КОНСТРУКТОР: холст сценариев, каналы (MAX, Telegram, Авито, VK, WhatsApp,
   Viber, TikTok). Puzzlebot прямо сейчас продаёт «опиши задачу словами — AI
   соберёт бота». Слабость против нас: клиент приходит В БОТА, а не к
   человеку; у бота брендинг сервиса.
2. **Мессенджеры → CRM** — textback.ru, Wazzup, Radist. Продают ТРУБУ в
   amoCRM/Битрикс: рассылки WhatsApp, «работа с базами 100к+», WABA. У
   TextBack уже есть «AI Agent — агент для продаж». Слабость: воронку двигают
   руками, карточки тащит человек.
3. **AI SDR** — artisan.co (Ava), 11x.ai (Julian/Alice, $70M+ от a16z и
   Benchmark). Продают ОБЪЁМ: автономный исходящий поток, почта + звонки,
   enterprise. Прямо противоположны нашему правилу «владелец жмёт кнопку».
4. **CRM с ИИ сверху** — Kommo (ex-amoCRM): «AI CRM for sales & messaging
   automation».

**Где мы одни.** Продавец живёт в ЛИЧНОМ аккаунте владельца (Telegram
Business) — клиент пишет человеку, а не боту с чужим логотипом. Факты CRM
ВЫВОДЯТСЯ (деньги + касания), а не проставляются руками. Ничего не уходит
клиенту без нажатия. И генерация (фото/видео/рилсы) продаётся тем же
леджером, что и CRM, — у перечисленных этого нет вовсе.

**Где мы слабее, честно.** Нет визуального холста сценариев (у Puzzlebot он
уже собирается словами). Один канал — Telegram; у Salebot и TextBack их
шесть-семь. Нет дашбордов воронки. Нет команд и ролей (у Kommo есть). Цены
конкурентов НЕ проверены: страницы тарифов рисуются скриптом, curl отдаёт
пустое — выдумывать числа не стал.

- 16.09.2026 01:05: Сторож по тексту исходника пишется под ОТФОРМАТИРОВАННЫЙ код: prettier перенёс длинную строку при коммите, и тест покраснел на вёрстке при верном поведении. В регулярке ставить \s\* там, где форматтер может разорвать строку.
