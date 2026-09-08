# Ledger audit 2026-09-09 — what was changed in `payments_v2`, and why

Owner's asks: "check my balance for anomalies and fix them", "find every
problem user", "who has no money", "we must know exactly what each expense was
for — fix all the transactions".

Everything below was applied through PostgREST with the service key. Every
touched row id is in `ledger-relabel-2026-09-09.json` next to this file, so each
step can be reverted exactly.

## 1. The owner's balance: 195 848 268 ⭐ → 17 891.5 ⭐

Twelve `is_test = true` rows dated 2025-07-27/28 (`payment_method = 'System'`,
`currency = 'STARS'`, description `TEST_DATA: System/Bonus/Testing`) form a
doubling series: 85 032.73 → 170 065.46 → … → 65 305 136.64 (twice). Each is
2× the previous — a test that re-granted the current balance. Sum:
195 830 377.19 ⭐, i.e. 99.99 % of the displayed balance.

Applied: `status = 'FAILED'` on exactly those 12 ids (the DB enum
`payment_status` has no CANCELLED; FAILED is the one non-counting value it
offers). `get_user_balance` went from 195 848 268.69 to 17 891.5 — the expected
value to the cent. Everything else on the owner's ledger (staff grants, small
test top-ups) is untouched.

Revert:

```sql
UPDATE payments_v2 SET status = 'COMPLETED'
WHERE telegram_id = 144022504 AND is_test = true AND status = 'FAILED'
  AND id IN (13356, 13359, 13372, 13373, 13374, 13375,
             13387, 13388, 13389, 13390, 13391, 13392);
```

## 2. Discovery: a trigger rewrites `service_type`

Relabeling 2286 expense rows by their own evidence (metadata.service_type,
payment_method, description) wrote 2286 rows and read back 696 with the planned
label. The database rewrote the rest on the way in:

| written              | stored           | rows |
| -------------------- | ---------------- | ---- |
| `ai_photoshop_scene` | `other`          | 1187 |
| `face_swap`          | `other`          | 36   |
| `avatar_transform`   | `other`          | 20   |
| `chat_with_avatar`   | `other`          | 2    |
| `flux_kontext`       | `neuro_photo`    | 146  |
| `image_upscaler`     | `neuro_photo`    | 38   |
| `ai_reels`           | `text_to_video`  | 161  |
| `text_to_image`      | `text_to_image`  | 428  |
| `image_to_video`     | `image_to_video` | 177  |
| `text_to_video`      | `text_to_video`  | 91   |

This trigger is not in the repository (`sql/` has no `service_type` trigger),
so the app cannot store the newer modes in the column at all — that is why
`sql/fix_all_users_services.sql` left every AI Photoshop row as `other`.
`description` is not touched by it (0 of 2286 descriptions changed).

**Owner action** (needs the SQL editor): list and read the trigger, then either
teach it the ModeEnum values or drop the rewrite.

```sql
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
WHERE tgrelid = 'payments_v2'::regclass AND NOT tgisinternal;
-- then: SELECT pg_get_functiondef('<function named in the trigger>'::regproc);
```

Until then the app treats the description as the source of truth (next
section), and the bot's balance screen regroups spend from the rows rather than
from the RPC's column grouping.

## 3. Descriptions now name the service

3517 expense rows carried the constant description `Payment operation` while
their metadata or payment_method named the mode. Each now reads
`Payment for service: <mode>`:

| mode                 | rows |
| -------------------- | ---- |
| `text_to_image`      | 1788 |
| `ai_photoshop_scene` | 1187 |
| `flux_kontext`       | 373  |
| `image_upscaler`     | 137  |
| `avatar_transform`   | 20   |
| `neuro_photo`        | 9    |
| `chat_with_avatar`   | 2    |
| `face_swap`          | 1    |

The bot writes the same shape for every new charge
(`processBalanceOperation`), and `resolveUserService` in
`src/utils/serviceMapping.ts` reads it back ahead of the column.

Revert: for the ids in the JSON, `SET description = 'Payment operation'`.

## 4. What could not be recovered

| rows | shape                                                         | why                                     |
| ---- | ------------------------------------------------------------- | --------------------------------------- |
| 332  | `payment_operation` / `Payment operation` / meta unknown_mode | the session had no mode when charged    |
| 140  | `null` / payment_method `unknown_mode`                        | same                                    |
| 114  | `null` / `Balance MONEY_OUTCOME`                              | written without any service field       |
| 114  | `payment_operation` / `System operation`                      | `updateUserBalance` default description |
| 13   | assorted singletons                                           | see the JSON                            |

713 rows, 0 written in the last 60 days for the first two shapes. They stay as
they are: inventing a service would be misattribution, not detail.

## 5. Users

- 629 users have ledger rows; 6 have a negative balance, all last active in
  2025 (worst: −4994 ⭐, 187 charges against 2 ⭐ of income — the pre-atomic
  charge path). None negative in the last 90 days.
- Active in the last 90 days: 12 users; 4 at zero (2 never topped up, 2 spent a
  single 8 ⭐ trial). Active in the last 30 days: 3, none at zero.
- All-time at ≤ 0: 206 (69 never paid; 137 paid and spent everything).
- 114 users carry `is_test` credit (196.9 M ⭐ in total, 195.9 M of it the
  owner's series above). The rest are deliberate `staff_access_grant` rows
  (50 000 ⭐ each) — not anomalies.
- 192 `PENDING` real invoices (72 users) — none newer than 30 days; abandoned
  checkouts, not uncredited payments.
- 279 payer ids have no `users` row: 241 are the 2025-04-27
  `System_Balance_Migration` import, 11 are a 2025-12-14 `admin_script` batch.
- 0 duplicate `inv_id` among COMPLETED rows.
