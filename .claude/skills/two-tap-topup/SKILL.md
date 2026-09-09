---
name: 'Two-Tap Top-Up'
description: 'Paying in two taps: the invoice from the answer becomes a button, «Мой баланс» names both ledgers honestly (payments_v2 in the bot vs user_tokens on the render), quick amounts only through render-priced invoices. Use for «пополнить», «не хватает токенов» after a payment, balance mismatches, or a refusal with no way to pay.'
---

# Two-Tap Top-Up

## When to Use This Skill

- Человек оплатил через ⭐-кнопки в боте, а агент всё равно отвечает «не хватает токенов».
- Добавляется или переносится кнопка пополнения, ряд сумм, ссылка на счёт.
- `💰 Мой баланс` и `my_balance` агента расходятся, или баланс показывает «0» тому, кто ещё не открывал счёт.
- Отказ без возможности оплатить в одно нажатие.

## Quick Diagnosis

```bash
# какая касса получила деньги
railway service vibee-render >/dev/null; railway variables --kv | cut -d= -f1 | grep -E '^SUPABASE_(URL|SERVICE_KEY)$'
grep -n "FIRST_ROW_GRANT\|balanceOf" apps/vibee-editor/render/src/agent/billing-shared.ts   # null ≠ 0: первые 20 токенов в подарок
grep -n "payRow" src/navigation/helpers/actionButtons.ts src/services/businessBotService.ts    # ряд оплаты из ссылки в ответе
```

## Solution Steps

1. **Ряд оплаты из ответа.** `payRow(text)` рисует `[Оплатить N ⭐]` из `https://t.me/$…`, которую агент пишет
   инструментом `tokens_invoice`/`crm_offer` **только когда человек сам попросил**. Счёт чеканит бот, к которому
   привязан человек (`bot-farm.ts`), не единая касса.
2. **Баланс честно.** «В боте: N ⭐ (для сцен) · У помощника: M токенов (для генераций)»; `null` на рендере —
   «счёт откроется на первой генерации, первые 20 токенов в подарок», никогда «0» (план).
3. **Быстрые суммы** — только через счета рендера с его ценой (`POST /api/tokens/invoice`), после того как маршрут
   примет серверный ключ с явным `telegram_id` (план).
4. Проверка: `npx vitest run src/__tests__/money` и живая оплата с **не-админского** аккаунта (админов рендер не списывает).

## Common Issues

- RPC `deduct_balance` не существует (CLAUDE.md, #999): списания в боте — read-check-write; второй путь не добавлять.
- `TOKENS_PAYMENT_BOT_TOKEN` — запасная касса (`@t27ai_bot`); свой бот человека — первым.
- Устаревший `session.selectedPayment` однажды перехватил `act:topup` — очищать перед входом в `StarPaymentScene`.

## Related Resources

- `src/navigation/helpers/actionButtons.ts`, `src/handlers/paymentHandlers/index.ts`, `src/handlers/handleSelectStars/index.ts`
- `apps/vibee-editor/render/src/agent/billing-shared.ts`, `token-invoice.ts`, `token-packs.ts`, `bot-farm.ts`
- Скилы: `payment-billing-expert`, `financial-audit`, `buttons-under-every-answer`
