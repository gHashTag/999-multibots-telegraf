---
name: 'Buttons Under Every Answer'
description: 'Every model answer in the bot goes out with inline buttons and every button has a handler. Use when adding an act:id, when a scene sends a model answer with a bare ctx.reply, when a press inside a wizard does nothing, or when a person sees literal [[…|act:…]] text.'
---

# Buttons Under Every Answer

Владелец: «юзеру в каждом ответе модели отправлять телеграм кнопки для юзер-френдли
взаимодействия». Правило: ответ модели человеку никогда не уходит голым текстом.

## When to Use This Skill

- Сцена или обработчик шлёт ответ модели через `ctx.reply(text)` без клавиатуры.
- Добавляется новый `act:<id>`, меняется `standardButtons`, или нажатие внутри визарда молчит.
- Человек видит в сообщении буквальные `[[Подпись|act:…]]` (мини-апп, бизнес-личка, история).
- Ответ в группе не приходит (Telegram отвергает `web_app`-кнопку вне лички) или длинный запасной ответ (> 4096) не доходит.

## Quick Diagnosis

```bash
grep -n 'ACTION_PREFIX}' src/navigation/registerCommands.ts   # по одной регистрации на каждый id из ACTIONS
npx vitest run src/__tests__/bot/actionButtonsAreLive.test.ts src/__tests__/bot/agentPromptMatchesOurButtons.test.ts src/__tests__/bot/buttonsUnderEveryAnswer.test.ts
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
3. **Ответ агента и запасной путь.** `buttonsForAnswer(text, isRu, { app: private, tail })`: ряд оплаты первым,
   если в ответе уже есть ссылка `https://t.me/$…` (`payRow`), затем предложенные агентом кнопки, стандартный
   набор, хаб владельца. Длинный текст — `разбитьДлинное`, клавиатура на последнем куске.
4. **Маркеры.** Только на поверхности `bot`. В бизнес-личке `stripAgentMarkers` перед записью в память и отправкой.
5. Проверка: `npx vitest run src/__tests__/bot` → зелёно; `node scripts/no-cyrillic-guard.cjs staged` → пусто.

## Common Issues

- Нажатие внутри визарда съедается шагом сцены — обработчики `act:*` должны стоять выше сцен; при новых
  сценах проверять живым нажатием (перенос на `stage.action` — отдельный шаг, см. риски дизайна).
- `parseAgentButtons` молча выбрасывает неизвестные id: id в промпте без записи в `ACTIONS` не рисуется.
- `web_app` в группе роняет всё сообщение — всегда передавать `{ app: private }`.
- `qwen3:1.7b` отвечает `[[Подпись|can]]` без инструментов — прежде чем судить о кнопках, переключить `/model`.

## Related Resources

- `src/navigation/helpers/actionButtons.ts`, `src/navigation/registerCommands.ts` (ответ агента, запасной путь, `act:*`)
- `src/helpers/telegramLongAnswer.ts` (`разбитьДлинное`)
- `apps/vibee-editor/render/src/agent/chat.ts` (`BUTTON_MARKERS`)
- Скилы: `business-dm-buttons`, `two-tap-topup`, `telegram-scenes-ULTIMATE`
