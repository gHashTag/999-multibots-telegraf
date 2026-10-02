# supabase-gateway

Makes a self-hosted PostgREST and storage-api look like Supabase to
`@supabase/supabase-js`, so the bot's 351 `.from()` / `.rpc()` call sites and
its `.storage.from()` uploads need no changes.

```
bot ──► supabase-gateway (public) ─/rest/v1──►  postgrest (private)  ──►  Postgres-NFrq
                                  └/storage/v1► supabase-storage     ──►  Postgres-NFrq (storage schema)
                                                 (private) :5000     ──►  Bucket (MinIO), bucket `supabase-storage`
```

## Why it exists

`supabase-js` builds its REST base as `new URL('rest/v1', baseUrl)` —
`SupabaseClient.js:78` in the installed package. That prefix is unconditional;
no value of `SUPABASE_URL` removes it. PostgREST serves tables at the root, so
`/rest/v1/users` would send it looking for a table named `rest`.

The trailing slash on `proxy_pass` is what strips the prefix. That single
character is the whole reason this service exists.

## Railway services

| service            | public    | role                                                                                                                                                    |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-gateway` | yes       | strips `/rest/v1` and `/storage/v1`, the only way in                                                                                                    |
| `postgrest`        | no        | PostgREST 12.2.3, private networking only                                                                                                               |
| `supabase-storage` | no        | `supabase/storage-api` 1.79.30; its env references `postgrest` (JWT secret, keys), `Postgres-NFrq` and `Bucket` with `${{...}}`, so no secret is copied |
| `Postgres-NFrq`    | TCP proxy | the data, on a volume                                                                                                                                   |
| `Bucket`           | yes       | MinIO; storage-api writes into its `supabase-storage` bucket                                                                                            |

storage-api runs its own migrations on boot (`DB_INSTALL_ROLES=true`) and owns
the `storage` schema. A bucket exists when it has a row in `storage.buckets`;
the ones the code uses are `images`, `ai-training`, `training-private`
(private), plus `dev`, `landingpage`, `sync-labs`, `leelachakra` carried over
from the cloud project.

## Auth

`supabase-js` sends `apikey` and `Authorization: Bearer <jwt>` carrying the same
value; PostgREST reads `Authorization` and ignores `apikey`. Both are forwarded
unchanged so nothing depends on which one is honoured.

Tokens are minted by `scripts/postgrest-mint-keys.cjs` in Supabase's own shape
(HS256, `{role, iss, iat, exp}`) and written straight into Railway — only
fingerprints are ever printed. The secret lives on the `postgrest` service as
`PGRST_JWT_SECRET`; the tokens the bot will need are alongside it as
`SUPABASE_ANON_KEY_NEW` and `SUPABASE_SERVICE_ROLE_KEY_NEW`.

## Not served here

`/auth/v1/` returns **501 with a message**, not 404: this app never signs anyone
in — zero `.auth` call sites. A 404 there would look like a routing bug; the 501
says what is actually going on.

## Cutover — done 2026-10-01 17:59 UTC

**A Railway variable change, on `999-multibots-telegraf` and `vibee-render`.**
Both services now point at this gateway; the key variables are references,
`${{postgrest.SUPABASE_SERVICE_ROLE_KEY_NEW}}`, so no secret was copied by hand.
`src/core/infisical/index.ts` would overwrite `process.env` with Infisical's
values — but only when its login succeeds. Checked 2026-10-01: the bot's
machine identity gets `401 Invalid credentials`, the catch branch runs
("Infisical unavailable, using process.env fallback"), and the Railway
variables are what the process sees. If that identity is ever repaired,
Infisical wins again and must carry the same three values first:

```
SUPABASE_URL              -> https://<gateway>.up.railway.app
SUPABASE_SERVICE_KEY      -> the value of SUPABASE_SERVICE_ROLE_KEY_NEW
SUPABASE_SERVICE_ROLE_KEY -> the value of SUPABASE_SERVICE_ROLE_KEY_NEW
```

Both key names must be set, because `getSupabaseKey()` returns
`SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY` and would otherwise keep
using the old Supabase anon key against the new host.

Rollback is putting the three old values back. Since the cutover the bot writes
only to Railway, so a rollback now strands every write made after 17:59 UTC.

### What was moved before the switch

- Every cloud table now exists on Railway (68 were cloud-only; recreated with
  their generated columns, enums and the `vector` extension, then copied).
  Row counts were compared table by table: Railway is behind on none.
- Rows present on both sides were compared by value, not by hash — jsonb
  numbers lose trailing zeros in a JSON round trip (`1110.00` -> `1110`), so
  `md5(row::text)` reports differences that are not there.
  - `payments_v2`: the cloud is the record of real money and had been
    backfilled later (`service_type`, descriptions, test rows marked `FAILED`).
    Cloud values won; the Railway values they replaced are kept in
    `payments_v2_railway_pre_cutover_20261002`.
  - `model_trainings`: the cloud won where its `updated_at` was newer.
  - `photo_url`, `avatar_url`, `zip_url`: Railway won. Those were rewritten on
    purpose to the Railway bucket or cleared as dead (`dead_storage_urls_backup`).
- Storage: all 849 cloud objects copied into the `supabase-storage` MinIO bucket
  through this gateway; bucket `training-private` created, the code used it
  but the cloud never had it.
- `users`: 12 stub rows render had created while the two bases were split were
  moved aside to `users_split_stubs_20261001`, not deleted.

Gateway deploys do not follow `main` automatically: trigger them with
`serviceInstanceDeployV2` in Railway GraphQL.
