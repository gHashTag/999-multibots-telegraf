# Client registry — whose bots we operate

One client = one bot = one `BOT_TOKEN_N` slot. Source of truth for the code
side is [`src/core/bot/index.ts`](../../../src/core/bot/index.ts) (`BOT_NAMES`).
Source of truth for ownership is the `avatars` table in Supabase
(`telegram_id` → `bot_name`), read through `getOwnedBots()`.

## Production (12 slots)

| # | Bot | Slot | Owner (telegram_id) | Onboarding link |
|---|-----|------|---------------------|-----------------|
| 1 | `neuro_blogger_bot` | `BOT_TOKEN_1` | ❓ not filled in | https://t.me/neuro_coder_ai/1212 |
| 2 | `MetaMuse_Manifest_bot` | `BOT_TOKEN_2` | ❓ not filled in | https://t.me/MetaMuse_manifestation/16 |
| 3 | `ZavaraBot` | `BOT_TOKEN_3` | ❓ not filled in | — |
| 4 | `LeeSolarbot` | `BOT_TOKEN_4` | ❓ not filled in | — |
| 5 | `NeuroLenaAssistant_bot` | `BOT_TOKEN_5` | ❓ not filled in | — |
| 6 | `NeurostylistShtogrina_bot` | `BOT_TOKEN_6` | ❓ not filled in | — |
| 7 | `Gaia_Kamskaia_bot` | `BOT_TOKEN_7` | ❓ not filled in | https://t.me/neuromeets/1876 |
| 8 | `Kaya_easy_art_bot` | `BOT_TOKEN_8` | ❓ not filled in | https://t.me/kaya_easy_art/13 |
| 9 | `AI_STARS_bot` | `BOT_TOKEN_9` | ❓ not filled in | — |
| 10 | `HaimGroupMedia_bot` | `BOT_TOKEN_10` | ❓ not filled in | — |
| 11 | `OM_AI_Digital_studio_bot` | `BOT_TOKEN_11` | ❓ not filled in | — |
| 12 | `t27ai_bot` | `BOT_TOKEN_12` | ❓ not filled in | Golden Foundry club |

## Not clients

`ai_koshey_bot`, `clip_maker_neuro_bot`, `helper_999_bot` and
`TestNeurocoder_bot` are dev slots that reuse `BOT_TOKEN_1/2`. Reports
arriving from them do not open a support ticket.

## How to fill the owner column

The column is empty on purpose: owner telegram_ids live in Supabase and
must not be invented. One query fills it:

```sql
SELECT bot_name, telegram_id, created_at
FROM avatars
ORDER BY bot_name;
```

Until it is filled, **do not** address a client "about your bot": there is
no way to verify you are writing to the owner rather than to some user of
that bot.

## Revenue

The repo ships `MULTI_BOT_FARM_DASHBOARD_2026-08-23.xlsx` with a per-bot
revenue/profit breakdown (376,259.60 ₽ revenue, 159,031.20 ₽ profit across
10 bots).

**Do not show these numbers to clients** — but not because the data is
dead.

`DATA_QUALITY_REPORT.json` sits next to it and returns a verdict of
`dataQualityScore: 0`, `validRecords: -1241` (negative) and
`TYPE_AMOUNT_MISMATCH` on 15,073 of 17,136 rows. That verdict is wrong. The
rule at
[`scripts/investment-analytics/data-quality.test.ts:150`](../../../scripts/investment-analytics/data-quality.test.ts)
demands a negative amount on `MONEY_OUTCOME`:

```ts
if (row.type === 'MONEY_OUTCOME' && amount > 0) return true  // flagged as an error
```

Payments follow the ordinary convention instead: the amount is a positive
magnitude and the direction is carried by the `type` column. So 15,073 of
all 15,222 debits — 99% — were declared broken, and `validRecords` went
negative because overlapping anomaly sets are subtracted twice.

What genuinely needs work (real defects, but a tractable list):

| Defect | Rows | Share |
|---|---|---|
| Full duplicates | 983 | 5.7% |
| Partial duplicates (`telegram_id`+`bot_name`+`created_at`) | 1540 | 9.0% |
| Unhandled types: `REFUND` 195, `BONUS` 1 | 196 | 1.1% |
| Currencies outside the dictionary: `USDC` 12, `TON` 1, `SYSTEM` 1 | 14 | 0.1% |
| Amounts > 10000, max 65,305,136.64 | 49 | 0.3% |

Plus the analytical problem the report missed entirely: one column holds
**three non-summable units** — `XTR` 12,636, `STARS` 4,192, `RUB` 294.
They cannot be added without a conversion rate, and the dashboard adds them.

Conclusion: revenue **can** be computed, after dedup and currency
normalisation. The work order is in
[`../client-daily-report/SKILL.md`](../client-daily-report/SKILL.md).
