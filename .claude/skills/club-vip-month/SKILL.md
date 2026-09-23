---
name: 'VIP-месяц клуба'
description: 'Как выдать человеку VIP (месяц клуба за наличные): команда /vip в Телеграме, ручной путь через /mcp, что пишет и что не пишет инструмент, и чем проверять результат. Загружать при словах «vip», «vip подписка», «выдай клуб», «месяц клуба наличными», «запиши оплату клуба», а также перед любой правкой club-cash / clubCash / /vip.'
---

# VIP-месяц клуба

Обновлено 23.09.2026, после первой выдачи @ledov_t27 (6716532024). VIP в языке
проекта — это **месяц клуба, оплаченный наличными** (club-cash.ts: «Two VIP
clients pay the owner for the club in cash»). Это НЕ гостевой пропуск: гость
ходит в клуб без месяца и без токенов, VIP получает настоящий оплаченный
период.

## 1. Одна таблица и один инструмент

Месяц пишется в `club_period` — тот же стол, который читает звёздная
подписка (`/api/club/status`), поэтому мини-апп сразу видит участника.
Инструмент один: `club_cash_month` (`apps/vibee-editor/render/src/agent/club-cash.ts`),
DIRECT_CALL_ONLY — дословно «be reachable by a sentence somebody else wrote»:
его нельзя вызвать фразой в чате агента, только прямым вызовом.

Что делает один вызов:

- строка в `club_period` (`star_tx_id = cash:<id>:<start>`, stars = 0);
- **+2571 токен** (доля месяца клуба: floor(10 000 ⭐ × 0.3 × 150/175)) через
  `creditStarsPayment`, charge id `club:cash:<id>:<day>`, в истории человека
  написано «наличные», не «Telegram Stars»;
- `payments_v2` не трогается НИКОГДА — это архив.

Гарантии: идемпотентность по дню начала (повтор ничего не удваивает); месяцы
не перекрываются (при перекрытии придёт отказ с `next_start` — днём, с
которого можно начать следующий); при найденной ручной выдаче с ref
`cash-club-*` инструмент спросит подтверждение (`tokens_already_given=true`).

Право записи: только владелец платформы (`OWNER_TELEGRAM_ID`, фолбэк 144022504) или хранители (`HIVE_KEEPERS`) — по ВЕРИФИЦИРОВАННОМУ вызывающему,
никогда по аргументу.

## 2. Путь владельца: /vip в Телеграме

```
/vip 6716532024                месяц с сегодня (UTC), токены начислит кассир
/vip 6716532024 2026-09-25     месяц с указанного дня
/vip 6716532024 вручную        токены месяца уже выданы руками — не начислять
```

Команда показывает текущий статус клуба человека и кнопку «Записать месяц»;
до нажатия в render ничего не уходит. Нажать может только тот, кто вызвал.
Бот (999-multibots-telegraf) шлёт `POST /mcp?telegram_id=<нажавший>` серверным
ключом `X-Api-Key` (`RENDER_API_KEY`), render сам решает, владелец ли нажал.
Гейт двойной: adminOnly в боте + mayRecordCash в render.

## 3. Ручной путь (когда бота под рукой нет)

```bash
cd apps/vibee-editor/render
KEY=$(railway variables --service vibee-render --kv \
  | sed -n 's/^AGENT_KEYS=\(.*\):144022504$/\1/p' | head -1)   # не печатать KEY
curl -s https://vibee-render-production.up.railway.app/mcp \
  -H "X-Agent-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
        "name":"club_cash_month","arguments":{"telegram_id":"6716532024"}}}'
```

Аргументы: `telegram_id` (обязателен), `start` (ГГГГ-ММ-ДД, по умолчанию
сегодня UTC), `tokens_already_given` (true — токены уже выданы вручную).
Ответ: `{ok, recorded:"now"|"already", until, tokens, credited}` или
`{ok:false, error, next_start?, tokens_given_by_hand?}`.

## 4. Чем проверять (ответу JSON не верить одному)

Живой Postgres render — публичный прокси: `DATABASE_PUBLIC_URL` на сервисе
`postgres-nfrq` (ballast.proxy.rlwy.net). Колонки: у `star_payments` —
`charge_id, telegram_id, amount`; у `user_tokens` — `telegram_id, balance`.

```sql
SELECT star_tx_id, tokens_granted, paid_at::date, until::date
  FROM club_period WHERE telegram_id = '<id>';
SELECT created_at::date, delta, kind, ref FROM token_ledger
  WHERE telegram_id = '<id>' ORDER BY created_at DESC LIMIT 2;
SELECT balance FROM user_tokens WHERE telegram_id = '<id>';
```

Ожидание: строка `cash:<id>:<start>` с until = start + 30 дней; в леджере
`+2571 | purchase | club:cash:<id>:<day>`; баланс вырос на 2571.

## 5. Частые случаи

- **«Уже активен до X» / отказ с next_start** — период идёт; следующий месяц
  начнётся с `next_start`, инструмент сам назовёт день. Заранее записанный
  месяц примыкает к предыдущему.
- **Вопрос про ручные токены** (`tokens_given_by_hand`) — до инструмента
  кому-то выдали токены руками с ref `cash-club-*`. Если это токены этого
  месяца: `/vip <id> вручную` или `tokens_already_given: true` — месяц
  запишется без второго начисления.
- **Человек не видит клуба в мини-аппе** — статус читается из `club_period`;
  проверь строку SQL-ом выше, прежде чем искать баг в приложении.
- **Выдать «просто доступ без месяца»** — это не VIP, это гостевой пропуск:
  `CLUB_GUESTS` на vibee-render (`railway variables --service vibee-render
--set "CLUB_GUESTS=<старые значения>,новый"` — держи существующие записи).
- **Баланс в боте ≠ баланс в приложении** — у бота свой кошелёк (выдаётся
  отдельно), у приложения — `user_tokens`. VIP-месяц меняет только второй.

## 6. Смежное

- Память сессии: `vip-month-is-club-cash-tool` (первая выдача, 2026-09-23).
- Сервис бота: `src/services/clubCash.ts`, команда: `src/commands/vipCommand.ts`.
- Тесты-контракты: `src/__tests__/money/theCashMonthIsRecordedByTheRenderNotHere.test.ts`,
  `src/__tests__/bot/vipCommand.test.ts`.
