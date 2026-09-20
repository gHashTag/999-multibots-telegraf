---
name: client-daily-report
description: "Daily report to the farm owner across the 12 client bots: what broke, what was fixed, what each client earned, what to propose to each client for revenue growth. Load on «ежедневный отчёт», «отчёт по клиентам», «как дела у ботов», «сводка за день», 'daily report', 'client report', and whenever working on revenue metrics or payment data quality."
---

# 📊 Daily client report

The report is addressed to the **farm owner**, not to the clients. Nothing goes
out to clients automatically. Registry —
[`../client-support-desk/CLIENTS.md`](../client-support-desk/CLIENTS.md).

## Report shape

One screen. If it does not fit, something that does not belong got in. Keep the
report body in Russian — the owner reads it.

```markdown
# Ферма ботов — <дата>

## Деньги
| Бот | Транзакций | Выручка | Δ к вчера | Активных юзеров |
|-----|-----------|---------|-----------|-----------------|
(one row per currency — never add XTR, STARS and RUB together)

## Сломалось
- <бот> — <симптом> — <статус: ищу / чиню / выкачено>

## Починено за сутки
- <бот> — <что было> → <что стало> — PR #<n>

## Что предложить клиентам
- <бот> — <наблюдение из данных> → <конкретное предложение>

## Требует решения владельца
- <вопрос, на который агент не имеет права отвечать сам>
```

Leave empty sections in with a dash; do not delete them. A missing "Сломалось"
section reads as "all good", not as "we forgot to check".

## Where the numbers come from

The Supabase payments table. Three rules, without which the report lies:

**1. Do not add currencies.** The data holds three units: `XTR` (12,636 rows),
`STARS` (4,192), `RUB` (294). No conversion rate exists anywhere in the code.
One row per currency; totals only within a currency. The dashboard
`MULTI_BOT_FARM_DASHBOARD_2026-08-23.xlsx` sums them into roubles, which is why
it is not a usable template.

**2. Deduplicate.** 983 full duplicates (192 groups) and 1,540 partial ones on
`telegram_id + bot_name + created_at`. Without dedup, revenue is overstated.

**3. Direction comes from `type`, not from the sign of the amount.**
`MONEY_OUTCOME` is a debit written as a positive number. Do not invert it and
do not treat it as an error: that is exactly what burned
`DATA_QUALITY_REPORT.json`, which declared 99% of debits broken (analysis in
CLIENTS.md). Types present: `MONEY_OUTCOME` 15,222, `MONEY_INCOME` 1,718,
`REFUND` 195, `BONUS` 1. Subtract `REFUND` from revenue; exclude `BONUS`.

## Work order: measure first, grow second

Until these are done, any sentence of the form "we raised this client's revenue
by N%" is invented, because the baseline has never been computed.

| # | Work | Why |
|---|------|-----|
| 1 | Fix the sign rule in `scripts/investment-analytics/data-quality.test.ts:150` | Otherwise the data-quality report is useless |
| 2 | Dedup on `telegram_id + bot_name + created_at + amount` | Revenue is overstated by an unknown amount |
| 3 | Currency dictionary + `XTR`/`STARS`→`RUB` rate at transaction date | Without it there is no per-client total |
| 4 | Fill owners in CLIENTS.md from the `avatars` table | Without it the report is not addressable |
| 5 | Inspect the 49 amounts > 10000 (max 65,305,136.64) | One such outlier distorts a whole month |

Only after 1–3 does the "Δ к вчера" column carry real meaning. Until then put
`—` in it, not zero.

## The "what to propose to clients" section

This is the only part of the report about revenue growth, and it has a hard
rule: **the proposal must follow from that client's own data, not from general
reasoning.**

Valid grounds for a proposal:

- A scene with high entry and low completion — the client is losing people who
  already showed up.
- A feature this client's users barely touch, while it carries a visible share
  of operations on a neighbouring bot.
- A `REFUND` spike on a specific bot — something promises what it does not do.
- A provider that fails more often on this bot than on the others.
- A gap between `MONEY_INCOME` (top-ups) and `MONEY_OUTCOME` (spend): they
  accumulate and do not spend, meaning they cannot find what to spend on.

Invalid: "add more AI models", "improve onboarding", "do a broadcast". Those
are categories, not proposals.

Line format: `<bot> — <what the numbers show> → <what to do> → <expected effect
and how we will check it>`.

## Boundaries

- **The report goes to the owner, never to clients.** Neither the whole report
  nor pieces of it.
- **We do not message clients.** Drafting a message: yes, gladly. Sending: the
  owner's own hands. The reason is not politeness — the agent has no way to
  verify that a recipient is really the bot owner while the owner column in
  CLIENTS.md is empty.
- **We do not touch tokens.** Not into chat, not into files, not into env vars.
- **A number the agent did not compute itself does not go in the report.**
  Taking a figure from the old xlsx and passing it off as today's is the worst
  thing this skill could do. No data → write "не посчитано" and why.
