# Token rotation runbook — 2026-10-02

Read-only investigation done on 2026-10-02 (~07:00 UTC). No secret was created,
rotated, revoked or printed. Every value below is entered by the owner, from
stdin, never inline on a command line (an inline value lands in shell history).

General rule for every `gh secret set` below: run it with **no** `--body`, paste
the token at the prompt, press Enter. `gh` reads it from stdin and it never
touches history. Same for `railway variables --set` — use the stdin form shown.

## Summary

| # | Token | Where | Status found | Action |
|---|-------|-------|--------------|--------|
| 1 | `PROJECT_TOKEN` | gHashTag/trinity secret (set 2026-03-12) | **BROKEN** — `gh: Bad credentials (HTTP 401)` on every run; zero successful runs of `project-auto-status.yml` back to 2026-09-06 | Create new classic PAT, set secret |
| 2 | `AGENT_GH_TOKEN` | gHashTag/trinity secret (set 2026-09-23) | **WORKS** — `board-release.yml` 5/5 green, last run opened 999-multibots-telegraf PR #3296 | Nothing now; note its expiry date |
| 3 | `RAILWAY_API_TOKEN` | gHashTag/trinity secret (set 2026-03-11) | **UNKNOWN** — `agent-queue-drain.yml` fails every 5 min, but the cause is the URL, not the token (see §3) | Fix the endpoint first; rotate only if it then says `Not Authorized` |
| 4 | Cloud Supabase keys (project `yuukfqcsdhkyxegfwlcb`, NeuroBlogger) | nothing live reads them (see §4) | **Unused since 2026-10-01 cutover**, still valid | Optional hardening: disable legacy keys / rotate JWT secret + DB password |
| 5 | Supabase personal access token (`sbp_…`) | `~/.claude.json` → MCP server `supabase` (project `/Users/playra/999-multibots-telegraf`, plus a `_disabledMcpServers_BACKUP` copy) | **WORKS** — `list_projects` answered (5 projects) | Rotate if the owner considers it exposed; update two places in `~/.claude.json` |
| 6 | Infisical machine identity of the bot (`INFISICAL_CLIENT_ID/SECRET` on Railway `999-multibots-telegraf`) | Railway | **BROKEN (401)** per memory; harmless because the bot falls back to `process.env` | Do NOT repair before Infisical holds the gateway values (§6) |

Red checks that are **not** token problems (do not rotate anything for them):

- **"Brain Health" / `brain-ci.yml` → `⚡ Brain Health Check`** — fails because
  `tri stress --health` prints `stress-test: TODO - not implemented yet`, so no
  `Score:` line exists. The workflow itself says "This is not a health
  regression". Needs code (implement the command or drop the job from required
  checks), not a token.
- **"PR work report and blog" (`pr-blog-report.yml`)** — `VALIDATION: failure`:
  the PR has no valid work report. Content gate, token is fine.
- **"Blog for PR" (`pr-blog-author.yml`)** — `claude-code-action` refuses:
  "Workflow initiated by non-human actor: github-actions (type: Bot). Add bot to
  allowed_bots". Config fix (`allowed_bots: github-actions` in the action's
  `with:`), not a token.
- t27 failures since 2026-09-28 (corpus ratchet, bit-exact gate, now-sync,
  issue-gate, pr-dashboard) — content/logic; Scorecard fails on
  `gcr.io … requires billing`. No 401s found.
- 999-multibots-telegraf Actions — billing-blocked (see CLAUDE.md); no
  Supabase/GitHub token involved.

---

## 1. `PROJECT_TOKEN` (gHashTag/trinity) — BROKEN, rotate

**Used by**
- `.github/workflows/project-auto-status.yml` — jobs `pr-opened`, `pr-merged`,
  `issue-closed`, `agent-started`: GraphQL `resource(url:)…projectItems` and
  mutation `updateProjectV2ItemFieldValue` on project `PVT_kwHOAGdgHc4A-axm`
  (= user project https://github.com/users/gHashTag/projects/6, "VIBECODER").
- `.github/workflows/project-auto-add.yml` — `actions/add-to-project@v1.0.2`
  into the same project (currently passes only because its label filter skips
  most PRs; with a labelled PR it would hit the same 401).

**Symptom**: run https://github.com/gHashTag/trinity/actions/runs/36975643735,
step "Get project item ID": `gh: Bad credentials (HTTP 401)`. Secret last set
2026-03-12 — a token from that date with default expiry has expired.

**Required type**: **classic PAT**. Projects v2 owned by a *user* account cannot
be written by a fine-grained PAT (fine-grained "Projects" permission exists only
for organisations). Scopes:
- `project` (read+write Projects v2) — required
- `repo` — needed so the token can resolve items that belong to private repos
  and so `add-to-project` can read issue/PR content (the action's documented
  requirement). If only public-repo items will ever be on the board,
  `public_repo` is enough instead of `repo`.
Nothing else (no `workflow`, no `admin:*`).

**Create**: https://github.com/settings/tokens/new?scopes=project,repo&description=trinity-PROJECT_TOKEN
— set an expiration and put that date in your calendar.

**Set**
```bash
gh secret set PROJECT_TOKEN --repo gHashTag/trinity
# paste the token at the prompt, Enter
gh secret list --repo gHashTag/trinity | grep PROJECT_TOKEN   # date must be today
```

**Verify**
`project-auto-status.yml` has no `workflow_dispatch`; it only runs on PR/issue
events. Cheapest real trigger: close (or re-close) any throwaway issue in
gHashTag/trinity — job `issue-closed` runs.
```bash
gh issue create --repo gHashTag/trinity --title "token check $(date +%F)" --body "PROJECT_TOKEN verification, close me"
gh issue close  --repo gHashTag/trinity <N>
gh run list --repo gHashTag/trinity --workflow project-auto-status.yml --limit 1
gh run view <id> --repo gHashTag/trinity --log | grep -E "401|Bad credentials" || echo "no auth errors"
```
Green = conclusion `success`, no `Bad credentials`. The next opened PR should
show `pr-opened` green as well.

Optional pre-check of the new token before storing it (prints only a login and
scopes, never the token):
```bash
read -rs T; GH_TOKEN="$T" gh api -i user 2>/dev/null | grep -iE '^x-oauth-scopes'; unset T
```
Expect `x-oauth-scopes: project, repo`.

---

## 2. `AGENT_GH_TOKEN` (gHashTag/trinity) — WORKS, no action now

**Used by**
- `.github/workflows/board-release.yml` (step "Open the release pull request in
  the app repository"): `gh api repos/gHashTag/999-multibots-telegraf`,
  `gh api --method PUT/POST` (write file / create branch ref),
  `gh pr list`, `gh pr create --repo gHashTag/999-multibots-telegraf`.
- `.github/workflows/pr-blog-author.yml` (`GH_TOKEN`, `github_token` of
  `claude-code-action`) — trinity itself.
- `agent-decompose.yml`, `agent-spawn-pool.yml`, `agent-ephemeral.yml` (all
  currently skipped).

**Status**: 5 of 5 latest `board-release.yml` runs `success` (last
2026-10-02T06:06Z, opened https://github.com/gHashTag/999-multibots-telegraf/pull/3296).
Secret set 2026-09-23. Its expiry date cannot be read from GitHub without the
value — check it on https://github.com/settings/personal-access-tokens (or
https://github.com/settings/tokens if classic) and calendar it.

**When it does need renewal — required type**: fine-grained PAT, resource owner
`gHashTag`, repositories **only** `gHashTag/999-multibots-telegraf` and
`gHashTag/trinity`, permissions:
- Contents: Read and write (branch + file commit for the release PR; blog
  commits in trinity)
- Pull requests: Read and write
- Issues: Read and write (blog outbox comments / agent workflows in trinity)
- Metadata: Read (automatic)

Create: https://github.com/settings/personal-access-tokens/new

```bash
gh secret set AGENT_GH_TOKEN --repo gHashTag/trinity
gh workflow run board-release.yml --repo gHashTag/trinity
gh run list --repo gHashTag/trinity --workflow board-release.yml --limit 1
```
Green = `success` and the log shows either a PR URL in
gHashTag/999-multibots-telegraf, "A pull request for … is already open." or
"The board is already current at …". Red with
`AGENT_GH_TOKEN is set but cannot read gHashTag/999-multibots-telegraf` = bad token.

Related, same family, both currently working (not rotated, listed so nobody
hunts for them): `GHIO_TOKEN` (trinity → ghashtag.github.io, set 2026-09-26,
`publish-apex-on-merge.yml` green) and `GH_AGENT_TOKEN` / `QUEEN_EXPORT_TOKEN`
in gHashTag/t27 (no 401s in t27 failures since 2026-09-28).

---

## 3. `RAILWAY_API_TOKEN` (gHashTag/trinity) — endpoint bug first, token unknown

**Used by**: `agent-queue-drain.yml` (every 5 min, **73 failures since
2026-09-30, no success in the last 200 runs**), `agent-cron-cleanup.yml`
(green), `agent-complete.yml`, `agent-spawn-pool.yml`, `agent-ephemeral.yml`,
`create-pool-services.yml`, `t27-media-schedules.yml` (green).

**Symptom**: `jq: parse error: Invalid numeric literal at line 1, column 10`.
The step POSTs to `https://railway.com/graphql/v2`, which today returns the
Railway **HTML website**, not JSON (verified: `curl -X POST
https://railway.com/graphql/v2` → `<!DOCTYPE html>…`). The API lives at
`https://backboard.railway.com/graphql/v2` (answers JSON
`{"errors":[{"message":"Not Authorized"…` for a bad token). So the failure says
nothing about the token yet.

**Do first (code, PR in trinity)**: replace `https://railway.com/graphql/v2` with
`https://backboard.railway.com/graphql/v2` in every trinity workflow:
```bash
grep -rln 'railway.com/graphql/v2' .github/workflows
```
(`agent-cron-cleanup.yml` also uses `railway.com/graphql/v2` and is "green" only
because it does not parse the answer strictly — fix it in the same PR.)

**Then, only if the drain now logs `Not Authorized`, rotate.** Required type:
Railway **account** token (or team token) with access to the project in
`RAILWAY_PROJECT_ID`; a *project* token will not do because the workflow sends
`Authorization: Bearer` to the public API and queries `project(id:)`.

Create: https://railway.com/account/tokens

```bash
gh secret set RAILWAY_API_TOKEN --repo gHashTag/trinity
gh workflow run agent-queue-drain.yml --repo gHashTag/trinity
gh run list --repo gHashTag/trinity --workflow agent-queue-drain.yml --limit 1
```
Green = `success` and the log has `📊 Free pool slots: N/2`.

Token pre-check without storing it anywhere:
```bash
read -rs T; curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"query":"{ me { email } }"}' | jq -r '.data.me.email // .errors[0].message'; unset T
```

---

## 4. Cloud Supabase keys — project `yuukfqcsdhkyxegfwlcb` (NeuroBlogger)

**Where they are still used — searched 2026-10-02:**
- Railway, all 52 services in all 11 projects visible to the CLI: **0**
  variables whose value contains `supabase.co`, `pooler.supabase` or
  `yuukfqcsdhkyxegfwlcb`. Every `SUPABASE_*` key on Railway is a JWT with no
  `ref` claim (self-issued by the gateway) and every `SUPABASE_URL` points to
  `supabase-gateway-production-122d.up.railway.app`:
  - `999-multibots-telegraf`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `vibee-render`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
  - `Postgres-NFrq`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `postgrest`: `SUPABASE_ANON_KEY_NEW`, `SUPABASE_SERVICE_ROLE_KEY_NEW`, `PGRST_JWT_SECRET`
  - `supabase-storage`: `ANON_KEY`, `AUTH_JWT_SECRET`, `PGRST_JWT_SECRET`, `DB_SERVICE_ROLE`
- GitHub Actions: **0** workflows in user gHashTag reference `SUPABASE`
  (code search `SUPABASE user:gHashTag path:.github/workflows` = 0), and **0**
  secrets named `*SUPABASE*` in the 121 non-archived repos pushed in 2026.
  999-multibots-telegraf `ci.yml`/`pr-checks.yml` write dummy `test_url`/`test_key`.
- Tracked files of 999-multibots-telegraf: no `sbp_` token and no real JWT.
- **Still holding cloud values: Infisical** (bot project, see §6) and possibly
  old code in other repos (`gHashTag/nexrender-server`, `ai-server`,
  `ai-server-express`, `NeuroLeelaAgent` read `SUPABASE_*` env) — none of them
  has a Railway service with a Supabase variable, so nothing *running* that we
  can see uses them.

**Status**: nothing live depends on the cloud keys. The project is still
`ACTIVE_HEALTHY`, so its keys still open the frozen copy, **including
`payments_v2`, the only record of real money (must not be deleted)**.

**Recommended (owner's choice) — lock the frozen copy, keep the data:**
1. API keys: https://supabase.com/dashboard/project/yuukfqcsdhkyxegfwlcb/settings/api-keys
   → "Legacy API keys" → **Disable JWT-based API keys** (or, if you want
   to keep a service key for audits, create one new secret key `sb_secret_…`
   first and keep it only in the password manager). This kills every old
   `anon`/`service_role` JWT at once.
   Alternative for the old dashboard: https://supabase.com/dashboard/project/yuukfqcsdhkyxegfwlcb/settings/jwt
   → "Generate a new JWT secret" (invalidates the old anon + service_role keys).
2. Database password: https://supabase.com/dashboard/project/yuukfqcsdhkyxegfwlcb/database/settings
   → "Reset database password". Store it only in the password manager; no
   Railway variable references the cloud host, so nothing needs updating.
3. Do NOT pause/delete the project (payments_v2 archive, refunds/disputes).

**Verify (nothing broke)**:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://supabase-gateway-production-122d.up.railway.app/rest/v1/   # gateway still answers (401/200, not 5xx)
railway logs --project 564d9ebd-7aa8-44fe-93ec-e0b03c87158d --environment e4d200ad-b8a9-4edf-9b25-190a32613b32 --service fc19cbc8-1c2e-407c-930f-82116fd64791 | grep -iE 'supabase|401|JWT' | tail -20
railway logs --project 564d9ebd-7aa8-44fe-93ec-e0b03c87158d --environment e4d200ad-b8a9-4edf-9b25-190a32613b32 --service 6339df9c-15b8-4f51-ba26-4af0b55c596a | grep -iE 'supabase|401|JWT' | tail -20
```
Green = no new `Invalid API key` / `JWT` errors in the bot (`999-multibots-telegraf`)
and render (`vibee-render`) for ~15 minutes, and a bot command that reads the
DB (e.g. `/start`) still answers. If something does break, it was reading the
cloud — that is the finding; re-point it to the gateway, do not re-enable keys.

---

## 5. Supabase personal access token (`sbp_…`) — local MCP config

**Where**: `~/.claude.json`, key
`projects["/Users/playra/999-multibots-telegraf"].mcpServers.supabase` — the
token appears twice (`args` after `--access-token`, and
`env.SUPABASE_ACCESS_TOKEN`), plus a stale copy in
`_disabledMcpServers_BACKUP.supabase`. Not in any repo, not on Railway, not
in GitHub secrets.

**Status**: valid (MCP `list_projects` returned 5 projects on 2026-10-02). It
has account-wide power over all 5 Supabase projects (SQL, migrations, pause).

**Rotate (if the owner wants it, e.g. because it sat in plaintext in a config
file and is passed on a process command line visible in `ps`)**:
1. Create: https://supabase.com/dashboard/account/tokens → "Generate new token".
2. Re-register the MCP server so the token is read from the environment, not
   argv (one place instead of three):
   ```bash
   claude mcp remove supabase -s local    # run inside /Users/playra/999-multibots-telegraf
   read -rs SUPABASE_ACCESS_TOKEN && export SUPABASE_ACCESS_TOKEN
   claude mcp add supabase -s local -e SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
     -- npx -y @supabase/mcp-server-supabase@latest
   unset SUPABASE_ACCESS_TOKEN
   ```
   and delete the `_disabledMcpServers_BACKUP` entry from `~/.claude.json`
   by hand (it holds the old token).
3. Revoke the old token on the same page (https://supabase.com/dashboard/account/tokens).

**Verify**: new Claude session in that project → `/mcp` shows `supabase`
connected → `list_projects` returns the 5 projects.

---

## 6. Infisical — bot machine identity (401)

**Where**: Railway `999-multibots-telegraf` service has `INFISICAL_CLIENT_ID`,
`INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENVIRONMENT`
(`vibee-render` has none). The identity answers 401, so `initInfisical` falls
back to `process.env` — which is what keeps the bot on the Railway gateway.

**Trap**: Infisical still holds the **cloud** `SUPABASE_URL` /
`SUPABASE_SERVICE_KEY`. Repairing the identity first would silently switch the
bot back to the frozen cloud on the next deploy.

**Order if the owner wants Infisical alive again**:
1. In https://app.infisical.com/ → project of `INFISICAL_PROJECT_ID`, env `prod`:
   set `SUPABASE_URL` to the gateway URL and `SUPABASE_SERVICE_KEY` +
   `SUPABASE_SERVICE_ROLE_KEY` to the gateway service key (copy from Railway
   `postgrest.SUPABASE_SERVICE_ROLE_KEY_NEW` via the dashboard, not the CLI).
2. Then: Organization → Access Control → Identities → the bot's identity →
   Universal Auth → create a new Client Secret.
3. ```bash
   read -rs V && railway variables --project 564d9ebd-7aa8-44fe-93ec-e0b03c87158d \
     --environment e4d200ad-b8a9-4edf-9b25-190a32613b32 \
     --service fc19cbc8-1c2e-407c-930f-82116fd64791 \
     --set "INFISICAL_CLIENT_SECRET=$V"; unset V
   ```
   (`--set` with a variable is still argv for the `railway` process for a
   moment; if that matters, set it in the Railway dashboard instead.)
4. Verify: `railway logs … --service fc19cbc8-…` shows Infisical loaded (no
   401) and the bot still answers; `SUPABASE_URL` the bot uses is the gateway.

If nobody needs Infisical: leave it broken on purpose, or remove the four
`INFISICAL_*` variables from the bot so the fallback is explicit rather than
accidental.

---

## IDs used above

- Railway project `999`: `564d9ebd-7aa8-44fe-93ec-e0b03c87158d`, env
  `production`: `e4d200ad-b8a9-4edf-9b25-190a32613b32`
- `999-multibots-telegraf`: `fc19cbc8-1c2e-407c-930f-82116fd64791`
- `vibee-render`: `6339df9c-15b8-4f51-ba26-4af0b55c596a`
- `postgrest`: `06e51a1c-68a7-44cb-8dad-ac48886619d2`
- GitHub project for `PROJECT_TOKEN`: https://github.com/users/gHashTag/projects/6

---

## 7. Plaintext credentials removed from gHashTag/trinity (PR #1258) — rotate all

gHashTag/trinity#1258 (merged as `7511cc7b`) replaced plaintext credentials
with environment lookups. **Removing them from HEAD does not un-leak them**:
every value is still in git history and in any clone or fork. Each one must
be revoked at its issuer and re-issued; no value is reproduced here.

| Credential | Was in | Now read from | Revoke / re-issue at |
|---|---|---|---|
| AMD account email + password | `fpga/fly-vivado/setup_and_synth.exp` | `$env(AMD_ACCOUNT_EMAIL)`, `$env(AMD_ACCOUNT_PASSWORD)` | https://account.amd.com → change password |
| DeepSeek API key | 4 generator scripts | `DEEPSEEK_API_KEY` | https://platform.deepseek.com/api_keys → delete old, create new |
| Telegram bot tokens (2 bots) | `.trinity/ralph/scripts/*.sh`, `fpga/tools/ralph-cron.sh` | `RALPH_TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_TOKEN` | @BotFather → `/revoke` for each bot |
| Kaggle API tokens (2, `KGAT_…`) | 24 files in `targets/kaggle/kaggle/*.py` | `KAGGLE_API_TOKEN` | https://www.kaggle.com/settings → API → expire token, create new |
| z.ai / GLM keys | model-proxy scripts | `MODEL_PROXY_API_KEY` | https://z.ai → API keys → delete, create |
| `.trinity/ralph/queue/.creds` | was tracked | untracked + `.gitignore` | rotate whatever it held (same issuers as above) |

**Where the new values go**: Railway variables of the service that runs the
script, or Infisical — never a tracked file, never a command line. Use the
stdin forms from the top of this document.

**Order**: re-issue first, store the new value, then revoke the old one, so the
running jobs (ralph cron, Kaggle runs) do not lose access in between. A Telegram
`/revoke` is immediate: update `RALPH_TELEGRAM_BOT_TOKEN` in the same minute.

**Verify**: the job that uses each value runs once green after the change, and
`git -C <trinity clone> grep -nE 'KGAT_|sk-[A-Za-z0-9]{20}|[0-9]{8,10}:AA[A-Za-z0-9_-]{30}' HEAD`
prints nothing.
