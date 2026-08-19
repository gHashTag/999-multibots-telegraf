---
name: "VIBEE stack: hard-won lessons"
description: "Read BEFORE touching the vibee editor, render server, Railway services or the Supabase→Railway migration. Encodes defects that a passing build does NOT catch, dead-code traps that made three separate fixes land in files nobody renders, and the verification rules that caught them. Use when editing apps/vibee-editor, deploying to Railway project 999, or changing anything the bot writes to the assets table."
---

# VIBEE stack: hard-won lessons

Everything here was paid for once. Do not re-derive it.

## THE RULE THAT MATTERS MOST

**A green build proves nothing. Verify on the live deploy.**

Every real defect in this stack passed `npm run build`. Every one was caught by
loading the deployed page and measuring it. If a change is not verified against
the running service, it is not done.

## Dead code that looks alive

This codebase has a repeated pattern: a component is built, committed, and wired
to nothing. Three separate fixes landed in such files before anyone noticed.

Confirmed dead or previously dead:
- `VerticalTabs`, `BottomNavigation` — exported, rendered nowhere. Superseded by
  `TelegramTabBar`.
- `components/AssetBrowser/AssetBrowser.tsx` — **not imported anywhere**.
  `Timeline` has its own inline browser instead.
- `assetBrowser.ts` exports a `CATEGORIES` array that nothing reads. `Timeline`
  declares its **own local** `CATEGORIES` at ~line 588.
- Four RPC wrappers in `getUserBalanceStatsOptimized.ts` call functions that do
  not exist in the database and have zero callers.

**Before editing a component, prove it renders:** grep for its import outside its
own folder, then confirm the element exists in the live DOM.

## Traps by area

### Railway
- `railwayConfigFile` resolves against the **repo root**; service-level
  `dockerfilePath` resolves against the **Root Directory**. Two conventions.
- A service's **first** deployment races the Root Directory setting and builds
  the repo-root Dockerfile. Push a commit to a watched path to get a correct one.
- Root `.dockerignore` patterns are context-root anchored — they do not match
  `apps/**`.
- Applying staged changes needs 2FA; the API cannot. Use the dashboard via
  BrowserOS neo.
- Serve **both** `/health` and `/healthz`: which config wins is not obvious.

### Supabase → Railway Postgres
- `SUPABASE_SERVICE_KEY` is **misnamed**: its JWT decodes to `role=anon`. The
  real one is `SUPABASE_SERVICE_ROLE_KEY`. `getSupabaseKey()` prefers the former,
  so the bot has been querying as anon.
- `DATABASE_URL` in the bot's variables is a dead local placeholder.
- PostgREST serves a full swagger at `GET /rest/v1/` with exact column types —
  authoritative, better than any inference.
- Fetch numerics as `::text`. `JSON.parse` collapses `"30.00"` to `30` and the
  scale is gone. `payments_v2.stars` is `numeric(12,2)`.
- `storage_path`, `trigger_word`, `type` are **NOT NULL** in `assets`.
- Cutover happens in **Infisical, not Railway**: `core/infisical/index.ts:172`
  overwrites `process.env` with every secret at boot.

### The editor
- `supabase-js` always appends `rest/v1` to the base URL (`SupabaseClient.js:78`).
  A bare PostgREST needs a path-stripping gateway.
- `response.statusText` is **empty on HTTP/2**, which is all Railway serves.
  Always include the status code and body in error messages.
- `--touch-target: 44px` exists in `index.css`. Nine controls set height through
  `padding` alone and measured 28px. Use explicit lists, never
  `button { min-height }` — it inflates the dense editor panels.
- Media in `public/` resolves against the **editor's own origin**
  (`MEDIA_ORIGIN`), never the render server, which has no `public/`.

### The render server
- `getPool()` throws **synchronously**. Outside a `try` it escapes an async
  handler and Node 20 kills the process — a one-request DoS.
- `type` in `assets` holds the **model name** (`veo3_fast`), not the media kind.
  Derive video/audio/image from the URL extension.
- The bot does **not** call `vibee-render`. `render-server-client.ts` hardcodes
  `render-v3-production.up.railway.app` — a different, unverified service.

## Self-check before reporting done

1. Does the changed component actually render? (live DOM, not build)
2. Did the deploy pick up the commit? (compare deployed commitHash to HEAD)
3. Does the endpoint answer from the caller's origin? (CORS, auth headers)
4. For data: counts AND exact sums as text, not counts alone.
5. Say plainly what was NOT verified. A green build is not verification.
