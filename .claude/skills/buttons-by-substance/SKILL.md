---
name: 'Buttons By Substance'
description: 'Кнопки под ответом модели появляются ПО СУЩЕСТВУ ответа, а не под каждым сообщением; у каждой кнопки есть обработчик. Загружать при добавлении act:id, когда сцена шлёт ответ модели голым ctx.reply, когда нажатие в визарде молчит, когда человек видит буквальные [[…|act:…]], и когда под ответом пусто или, наоборот, кнопки лишние.'
---

# Buttons By Substance

**Решение владельца, 24.09.2026** (оно ОТМЕНЯЕТ прежнее): «сделай чтобы кнопки
агент показывал по существу а не в каждом сообщении!! изучи как у нас в браузере
сделано и сделай по аналогии».

Прежде было: «юзеру в каждом ответе модели отправлять телеграм кнопки». Так и
работало — четыре кнопки под каждым ответом, потому что ответ случился.

**Аналогия с браузером — та, которую просили, и она точная.** Разрешение там
спрашивается **по МЕСТУ, а не по действию** (`src/browser/guard.ts`): клик — это
точка на экране, и вопрос заслуживает не сам факт клика, а то, куда он попал.
Ряд, который есть всегда, не несёт сведений: в тот единственный раз, когда
«пополнить» важно, он выглядит ровно как в сотне раз, когда был не нужен.

Теперь каждая стандартная кнопка требует ПРИЧИНЫ В ОТВЕТЕ
(`earnedButtons`, `src/navigation/helpers/actionButtons.ts`):

| кнопка     | когда появляется                                             |
| ---------- | ------------------------------------------------------------ |
| `topup`    | в ответе речь о нехватке, цене, оплате                       |
| `balance`  | в ответе речь о самом балансе                                |
| `can`      | ответ говорит, что чего-то нельзя, или перечисляет доступное |
| `human`    | ответ не получился, отказ, неуверенность                     |
| приложение | ответ указывает в приложение — и только в личке              |

**Что НЕ изменилось, потому что и так было по существу:** ряд оплаты при живой
ссылке на счёт и кнопки, которые предложил сам агент маркерами `[[…|act:id]]`.
Вдвоём они покрывают обычный случай — поэтому отмена сплошного набора оставляет
ответ голым только тогда, когда предложить действительно нечего.

**Ничего не заработано — клавиатуры НЕТ вовсе** (`markup: undefined`, не пустая:
Telegram отвергает inline-клавиатуру без кнопок).

Хаб владельца (`tail`) не тронут: это его поверхность, а не клиентская.

## When to Use This Skill

- Сцена или обработчик шлёт ответ модели через `ctx.reply(text)` без клавиатуры.
- Добавляется новый `act:<id>`, меняется `standardButtons`, или нажатие внутри визарда молчит.
- Человек видит в сообщении буквальные `[[Подпись|act:…]]` (мини-апп, бизнес-личка, история).
- Ответ в группе не приходит (Telegram отвергает `web_app`-кнопку вне лички) или длинный запасной ответ (> 4096) не доходит.

## Quick Diagnosis

```bash
grep -n 'ACTION_PREFIX}' src/navigation/registerCommands.ts   # по одной регистрации на каждый id из ACTIONS
npx vitest run src/__tests__/bot/actionButtonsAreLive.test.ts src/__tests__/bot/agentPromptMatchesOurButtons.test.ts src/__tests__/bot/buttonsUnderEveryAnswer.test.ts src/__tests__/bot/buttonsBySubstance.test.ts
grep -n "ctx.reply(" src/scenes/aiChatWizard/index.ts src/scenes/chatWithAvatarWizard/index.ts | grep -v standardButtons   # ответы модели без кнопок
grep -n "surface === 'bot' ? BUTTON_MARKERS" apps/vibee-editor/render/src/agent/chat.ts   # маркеры только для поверхности bot
```

## Solution Steps

1. **Новый id.** Запись в `ACTIONS` (`src/navigation/helpers/actionButtons.ts`, ru + en), обработчик
   `bot.action(\`${ACTION_PREFIX}<id>\`, …)`в`registerCommands.ts`рядом с`act:can`—`answerCbQuery`первой
строкой; обновить`BUTTON_MARKERS`в`apps/vibee-editor/render/src/agent/chat.ts` и подсказку запасного
пути (`где id — одно из: topup, balance, can, human`). Тест `agentPromptMatchesOurButtons` не даст забыть.
2. **Ответ сцены.** `await ctx.reply(text, standardButtons(isRu, { app: ctx.chat?.type === 'private' }))`;
   для подписи к фото/документу — `reply_markup: standardButtons(...).reply_markup`.
3. **Ответ агента и запасной путь.** `buttonsForAnswer(text, isRu, { app: private, bot: ctx.botInfo, tail })`: ряд оплаты первым,
   если в ответе уже есть ссылка `https://t.me/$…` (`payRow`), затем предложенные агентом кнопки, затем
   **заработанные ответом** (`earnedButtons`), хаб владельца. Длинный текст — `разбитьДлинное`, клавиатура
   на последнем куске. **`markup` может быть `undefined`** — вызывающий обязан это пережить: он уже передаёт
   `undefined` для всех кусков, кроме последнего, так что путь проверен.
4. **Маркеры.** Только на поверхности `bot`. В бизнес-личке `stripAgentMarkers` перед записью в память и отправкой.
5. Проверка: `npx vitest run src/__tests__/bot` → зелёно; `node scripts/no-cyrillic-guard.cjs staged` → пусто.

## Common Issues

- Нажатие внутри визарда съедается шагом сцены — обработчики `act:*` должны стоять выше сцен; при новых
  сценах проверять живым нажатием (перенос на `stage.action` — отдельный шаг, см. риски дизайна).
- `parseAgentButtons` молча выбрасывает неизвестные id: id в промпте без записи в `ACTIONS` не рисуется.
- `web_app` в группе роняет всё сообщение — всегда передавать `{ app: private }`.
- **Ссылки на приложение открываются ВНУТРИ Telegram** (владелец, 2026-09-22). Кнопка в
  приложение: в личке — `web_app`, вне лички (группа, канал, бизнес) — url-кнопка на
  `appLinkFor(bot, route)` (`appButton` в `src/navigation/helpers/appLinks.ts`). Никогда
  url-кнопка или текст с голым `app.t27.ai`/`vibee-editor-production`: в браузере без подписи
  приложение не открывается. `buttonsForAnswer` получает `{ bot: ctx.botInfo }` — тогда
  сырой адрес приложения в ответе модели переписывается сам. Скил `links-open-in-telegram`.
- `qwen3:1.7b` отвечает `[[Подпись|can]]` без инструментов — прежде чем судить о кнопках, переключить `/model`.
- **A press that did not land gives the buttons back** (audit 2026-10-03). A relayed press
  (`bap:`, `mtg:`, `tgp:ok`) strips the card at once — a second tap has nothing to hit while
  the relay is in flight — and on failure puts back `ctx.callbackQuery.message.reply_markup`
  (`restoreButtons`). Settle the card ("✅ Sent") only AFTER reading the result. Each failure
  says why (`SAID` in `src/services/browserApproval.ts`: no key / restarting / timeout /
  offline), never one "try again in a minute". Quiet retry only where a repeat is harmless
  (the approve token decides once; meeting "later" inserts a reminder per press — no retry;
  a dropped send is "not sure", never retried). Live proof: `tri relays` (key parity by hash,
  guard 401, approve and meeting with junk tokens, failures across every deploy in the window —
  `railway logs` without an id reads only the current deploy).
- **The probe runs itself every hour: `tri relays-watch`** (`bin/helpers/relays-watch.sh`,
  launchd `ai.t27.relays-watch`). Render down (000/5xx): it waits out a deploy swap, then
  redeploys `vibee-render` at most once per 6 h and reports what broke, what it did and the
  result. Key or 401 problems are reported with the next step, never touched. `tri relays-watch
status` shows the state. Install from a shell where `railway whoami` works: launchd's PATH
  once found an old railway 4.5.4 that was "Unauthorized", so every run said "not measured".
  `install` now pins the logged-in CLI and refuses an install that could not measure.

## Railway watch

The same probe runs every hour on Railway as the cron service `queen-watch`, so a
starved Mac no longer means a silent watch. It reports only on change -- to the Queen
(`/queen/report`), to the owner's DM and, on red, to one open GitHub issue labelled
`queen-watch`. What it probes, what it heals and what it never heals is written in one
place: the header of `deployment/queen-watch/watch.mjs`. The steward that acts on it:
`.claude/agents/queen-steward.md`.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.

## Related Resources

- `src/navigation/helpers/actionButtons.ts`, `src/navigation/registerCommands.ts` (ответ агента, запасной путь, `act:*`)
- `src/helpers/telegramLongAnswer.ts` (`разбитьДлинное`)
- `apps/vibee-editor/render/src/agent/chat.ts` (`BUTTON_MARKERS`)
- Скилы: `business-dm-buttons`, `two-tap-topup`, `telegram-scenes-ULTIMATE`
