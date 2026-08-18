# supabase-gateway

Makes a self-hosted PostgREST look like Supabase to `@supabase/supabase-js`, so
the bot's 351 `.from()` / `.rpc()` call sites need no changes.

```
bot ──► supabase-gateway (public)  ──►  postgrest (private)  ──►  Postgres-NFrq
        strips /rest/v1                 :3000                     volume-backed
```

## Why it exists

`supabase-js` builds its REST base as `new URL('rest/v1', baseUrl)` —
`SupabaseClient.js:78` in the installed package. That prefix is unconditional;
no value of `SUPABASE_URL` removes it. PostgREST serves tables at the root, so
`/rest/v1/users` would send it looking for a table named `rest`.

The trailing slash on `proxy_pass` is what strips the prefix. That single
character is the whole reason this service exists.

## Railway services

| service | public | role |
|---|---|---|
| `supabase-gateway` | yes | strips `/rest/v1`, the only way in |
| `postgrest` | no | PostgREST 12.2.3, private networking only |
| `Postgres-NFrq` | TCP proxy | the data, on a volume |

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

`/storage/v1/` and `/auth/v1/` return **501 with a message**, not 404. Objects
live in MinIO, and this app never signs anyone in — zero `.auth` call sites.
A 404 there would look like a routing bug; the 501 says what is actually going on.

## Cutover, when it happens

**Not a Railway variable change.** `src/core/infisical/index.ts:172` overwrites
`process.env` with every Infisical secret at boot, exempting only
`INNGEST_SERVE_ORIGIN` and `BASE_WEBHOOK_URL`. So `SUPABASE_URL` set in Railway
is clobbered on startup. The switch — and the rollback — happen in **Infisical**:

```
SUPABASE_URL              -> https://<gateway>.up.railway.app
SUPABASE_SERVICE_KEY      -> the value of SUPABASE_SERVICE_ROLE_KEY_NEW
SUPABASE_SERVICE_ROLE_KEY -> the value of SUPABASE_SERVICE_ROLE_KEY_NEW
```

Both key names must be set, because `getSupabaseKey()` returns
`SUPABASE_SERVICE_KEY || SUPABASE_SERVICE_ROLE_KEY` and would otherwise keep
using the old Supabase anon key against the new host.

Rollback is putting the three old values back — free until the new stack has
accepted writes, at which point those writes exist only on Railway.
