---
name: billing
description: Financial audit and billing report for bot owners — income, costs, debt in ₽/$
---

# Billing — Финансовый отчёт по владельцам ботов

Полный аудит: сколько владелец получил от клиентов (Stars + Robokassa + Crypto), сколько платформа потратила на AI, долг владельца.

## Использование

```
/billing              — полный отчёт по всем владельцам
/billing 144022504    — отчёт по конкретному владельцу
/billing send         — отправить отчёты владельцам в Telegram
```

## Как работает

Используй скилл `financial-audit` — он содержит полную методологию:
- Пагинация Supabase (лимит 1000 записей, нужно загружать все ~17K)
- Разделение реальных платежей от системных бонусов
- Конвертация валют (Stars/₽/$)

## Быстрый запуск

### 1. Загрузить credentials
```bash
SUPABASE_URL=$(grep "^SUPABASE_URL=" /tmp/railway_secrets.txt | head -1 | sed "s/^SUPABASE_URL='//;s/'$//")
SUPABASE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" /tmp/railway_secrets.txt | head -1 | sed "s/^SUPABASE_SERVICE_KEY='//;s/'$//")
```

### 2. API эндпоинт (если задеплоен)
```bash
BASE="https://999-multibots-telegraf-production-2008.up.railway.app"
curl -s "$BASE/api/billing" | python3 -m json.tool
curl -s "$BASE/api/billing/neuro_blogger_bot"
```

### 3. Полный аудит через Supabase
Загрузить ВСЕ записи пагинацией (см. financial-audit skill → references/audit-query.md).

## Формат отчёта по владельцу

```
👤 Владелец: {telegram_id} | {N} ботов | {M} клиентов

🤖 @{bot_name} ({K} клиентов)

   💰 ДОХОД (клиенты заплатили владельцу):
      Telegram Stars: {N}⭐  = {X}₽  = ${Y}
      Robokassa:              = {X}₽  = ${Y}
      Крипто USDC:            = {X}₽  = ${Y}
      ИТОГО:                  = {X}₽  = ${Y}

   💸 СЕБЕСТОИМОСТЬ AI (платформа потратила):
      neuro_photo       {N}⭐ = {X}₽ = ${Y}
      image_to_video    {N}⭐ = {X}₽ = ${Y}
      ИТОГО:            {N}⭐ = {X}₽ = ${Y}

   📊 ПРИБЫЛЬ:                = {X}₽ = ${Y} ({margin}%)
   ⚠️  ДОЛГ ПЛАТФОРМЕ:         = {X}₽ = ${Y}
```

## Конвертация
- 1 Star = $0.016 = ~1.45₽
- 1 USD = ~91₽
- Robokassa: поле `amount` = рубли, `stars` = конвертировано
- Stars (Telegram): поле `stars` = реальные звёзды
- Реальные методы оплаты: Telegram, Robokassa, TON_NATIVE, X402, CryptoBot

## Отправка отчётов владельцам

При команде `/billing send`:
1. Рассчитать долг каждого владельца
2. Сгенерировать HTML-отчёт через `generateDebtReport()` из `src/services/bot-owner-billing.ts`
3. Отправить через `notifyOwnerAboutDebt()` с уровнем `'soft'` / `'warning'` / `'critical'`

Пороги:
- > 100⭐: мягкое напоминание
- > 300⭐: предупреждение + кнопка оплаты
- > 500⭐: критическое + отключение через 3 дня

## Связанные файлы
- `src/services/bot-owner-billing.ts` — расчёт долга, отчёты, уведомления
- `src/api_server/routes/billing.routes.ts` — API эндпоинты
- `.claude/skills/financial-audit/` — скилл с методологией
- `.claude/skills/payment-billing-expert/` — скилл по платежам
