---
name: "Financial Audit"
description: "This skill should be used when the user asks to 'audit finances', 'check billing', 'show debt', 'financial report', 'owner payments', 'revenue report', 'profit margins', 'who owes money', 'billing audit', mentions 'payments_v2', or requests analysis of bot owner income, costs, and debt in RUB/USD/Stars."
---

# Financial Audit — Bot Owner Billing Analysis

Analyze the `payments_v2` Supabase table to generate detailed financial reports per bot owner, showing income (Stars + Robokassa + Crypto), AI costs by service, profit margins, and debt.

## When to Use

- Owner asks for financial audit, billing report, or debt check
- Need to understand per-bot profitability
- Checking which bot owners owe money to the platform
- Generating reports for bot owners showing their earnings vs platform costs

## Architecture

### Key Tables
- **`payments_v2`** — all transactions (17K+ records). Fields: `telegram_id`, `bot_name`, `type` (MONEY_INCOME/MONEY_OUTCOME), `amount` (original currency), `stars`, `currency` (XTR/RUB/USDC/TON), `payment_method`, `service_type`, `cost`
- **`avatars`** — bot ownership. Fields: `telegram_id` (owner), `bot_name`

### Critical: Pagination Required
Supabase returns max 1000 records per request. Always paginate:
```
offset=0&limit=1000, offset=1000&limit=1000, ... until batch < 1000
```

### Currency Conversions
- 1 Star = $0.016 = ~1.45₽
- 1 USD = ~91₽
- Amount field = original currency value
- Stars field = converted to stars value

### Income Classification
**Real payments** (money owner received): `payment_method` IN (`Telegram`, `Robokassa`, `TON_NATIVE`, `X402`, `CryptoBot`)
**System** (not real income): everything else (System, Admin, Manual, Bonus, Migration, Refund)

### Cost Structure
`type = MONEY_OUTCOME` records represent AI costs. The `stars` field shows cost in stars. `service_type` shows what service was used (neuro_photo, image_to_video, etc.)

## Audit Process

1. Load ALL records from `payments_v2` via pagination (both MONEY_INCOME and MONEY_OUTCOME)
2. Load `avatars` table to map bot_name → owner telegram_id
3. For each owner's bots, calculate:
   - **Real income**: sum of `amount` (for RUB) and `stars` (for XTR) where payment_method is real
   - **AI costs**: sum of `stars` from MONEY_OUTCOME records
   - **Profit**: income - costs
   - **Margin**: profit / income * 100
4. Show all amounts in **both ₽ and $**
5. Break down costs by `service_type`
6. Break down income by `currency` and `payment_method`

## Report Format

For each bot owner show:
- Owner ID, number of bots, number of clients
- Per bot: income breakdown (Stars/Robokassa/Crypto → ₽ and $)
- Per bot: AI cost breakdown by service_type → ₽ and $
- Per bot: profit and margin %
- Per bot: debt to platform
- Owner total: income, costs, profit, debt

Platform total: all owners combined.

## API Endpoints

- `GET /api/billing` — all bots debt summary (JSON)
- `GET /api/billing/:botName` — detailed report for one bot
- `GET /api/providers` — AI provider health status

## Additional Resources

### Reference Files
- **`references/audit-query.md`** — complete Python audit script with pagination
- **`references/billing-system.md`** — bot-owner-billing.ts service documentation

### Key Source Files
- `src/services/bot-owner-billing.ts` — billing calculation service
- `src/services/provider-health-monitor.ts` — provider status checks
- `src/api_server/routes/billing.routes.ts` — billing API endpoints
- `src/core/supabase/notifyBotOwners.ts` — owner notification system
