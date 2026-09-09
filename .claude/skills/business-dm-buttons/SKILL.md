---
name: 'Business DM Buttons'
description: 'Buttons under answers to a client in Telegram Business, where the bot answers as the owner: url buttons only, the pay row only from an invoice link already in the answer, markers stripped, long answers chunked. Use when changing the client-facing keyboard in businessBotService, when a DM answer did not arrive, or when someone wants balance / call-the-owner buttons in DMs.'
---

# Business DM Buttons

Бот отвечает клиенту от имени владельца через `business_connection_id`. Telegraf 4.16.3 о бизнес-чатах не знает:
единственный примитив отправки — `bot.telegram.sendMessage(chatId, text, { business_connection_id })`.

## When to Use This Skill

- Меняется клавиатура под ответом клиенту в `src/services/businessBotService.ts` (`handleBusinessMessage`).
- Клиент сообщает о кнопке, которая ничего не сделала, или ответ попал в чат бота вместо лички.
- Ответ не дошёл: `railway logs | grep '\[Business\] Failed to reply'` → «message is too long» или `BUTTON_TYPE_INVALID`.
- Просят «мой баланс», «позвать владельца» под ответами в личке.

## Quick Diagnosis

```bash
grep -n "payButton(reply)\|Открыть в боте\|разбитьДлинное(reply)" src/services/businessBotService.ts   # единственное место клавиатуры
grep -n "stripAgentMarkers" src/services/businessBotService.ts   # одно попадание в answerClient до recordTurns
npx vitest run src/__tests__/services/businessDmContext.test.ts src/__tests__/services/businessDmMedia.test.ts src/__tests__/services/businessAgentFirst.test.ts
```

## Solution Steps

1. **Фаза 1 — только url-кнопки.** Порядок рядов `[Оплатить N ⭐]?` → `[🚀 Открыть в боте]`; ряд оплаты только
   из ссылки `https://t.me/$…`, которая уже есть в ответе (правило владельца: не предлагать оплату первым).
   Новые ряды — только ниже (тесты закрепляют `[0][0]`).
2. **Маркеры.** `stripAgentMarkers` в `answerClient` до `recordTurns` — та же чистая строка идёт в отправку и в зеркало.
3. **Длинные ответы.** `разбитьДлинное(reply)`, клавиатура на последнем куске.
4. **Фаза 2 (план) — callback-кнопки** `dm:human` / `dm:balance`: обработчик читает `business_connection_id` из
   `callbackQuery.message`, отвечает через соединение, никогда через `ctx.reply`.
5. Проверка живьём: одно сообщение со второго аккаунта → один ответ через соединение, одно уведомление владельцу, ноль
   сообщений в чат бота.

## Common Issues

- `replyButtonUrl` подбирает deep-link по словам **клиента**, а не по ответу.
- Агент в личке работает **как клиент** (`surface: 'business'`): токены и память клиента.
- Ключ сессии `${from.id}:${chat.id}` совпадает у бизнес-чата и личного чата бота с тем же человеком.
- Права соединения в Bot API 9.0 (`rights.can_reply`) — `canReplyOf` понимает обе формы.

## Related Resources

- `src/services/businessBotService.ts`, `src/navigation/helpers/actionButtons.ts` (`payRow`, `stripAgentMarkers`)
- `apps/vibee-editor/render/src/agent/chat.ts` (`DM_CLIENT_BULLET`, `dmHistoryBlock`)
- Скилы: `buttons-under-every-answer`, `owner-two-tap-onboarding`
