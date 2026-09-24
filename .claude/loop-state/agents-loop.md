# Agents & digital clone: improvement loop state

Memory between cron ticks of the agents loop (owner, 2026-09-24: "continuous
improvement loop, don't break past work, self-critical, find anomalies, heal").
Read FIRST (`TRI_LOOP=agents tri loop`), write at the END
(`TRI_LOOP=agents tri loop-note "…"`). The CRM loop keeps its own file
(`crm-loop.md`); never edit that one from here.

## ⛔ SO A NEW TICK DOES NOT BREAK PAST WORK

1. `git fetch origin main` first. The designated branch
   `claude/vibrant-heisenberg-bijrhv` restarts from origin/main once its PR
   is merged (fast-forward only; never force-push: CLAUDE.md rule 0).
2. Read "СЕЙЧАС В РАБОТЕ". A task named there with an open PR is continued
   on that PR, not started again.
3. Before every push: `vitest related` over the touched files in render and
   player, `check:player-types`, the cyrillic and secret guards. A full
   root run needs ~14 GB: do not run it inside `verify` in this container.
4. Every change ships with a test that fails when the change is reverted
   (mutation), and the mutation is shown in the commit message.
5. Never merge without the owner's explicit word in chat. Never read a
   secret value into the conversation (`${{service.VAR}}` references only).
6. Anything outward (a Railway service, a deploy, a post) is created only
   with the owner's approval, and removed right after use.

## СЕЙЧАС В РАБОТЕ

- Tick 1 (24.09 07:20 UTC): Brave Search API backend for web_search, `tri
agents`, this memory file. Branch claude/vibrant-heisenberg-bijrhv, PR #2960
  (draft, not merged: needs the owner's word).
- Tick 2 (24.09 07:40-08:30 UTC): epic #2961 (digital clone, every network)
  with sub-issues #2962-#2966, all on PR #2960. Done: #2962 browser_logins +
  `tri logins` (10e31f84); #2963 clone status `accounts` + profile card
  (a212a622); #2965 rounds skip not-connected networks + 5 social sites
  (8ff1a28a); #2964 prompt line; #2966 closed (already honest in the player).
- NEXT: #2964 live A2A run after merge (`tri logins` -> `tri a2a "подключи мои
сети"` -> `tri logins`); Instagram/Threads posting through the browser
  (blog-share only does X/LinkedIn/Reddit) as a new sub-issue of #2961;
  job_hunters over crm_messages.

## Что уже есть

- Epic #2943 (merged, PR #2952): mail\_\* (Zoho), contact book, resume
  cursor, crm_clients paging, CRM groups, group post card.
- Epic #2956 (merged, PR #2952): owner preview of trainees, contracts for
  google/tiktok/habr, starters for all, `scripts/agents-acceptance.cjs`.
- Acceptance on production, 24.09 07:14–07:19 UTC: **5/5 PASS** (blogger,
  job, google, tiktok, habr).

## Anomalies seen (self-heal list)

- [ ] google: `web_search` reserve (OpenRouter) answers **HTTP 402**, no
      balance -> falls to the keyless floor. Code fix: Brave API backend (tick
      1). Owner action: set BRAVE_SEARCH_API_KEY on vibee-render (free tier) or
      top up OpenRouter.
- [ ] habr: `web_read` of raw.githubusercontent.com failed, the GitHub page
      worked. Check web-guard/proxy for raw hosts.
- [ ] job: job_hunters scans 60 dialogs x ~20 messages live; found nobody.
      Level up: also read the ingested history (crm_messages), which is deep.
- [ ] Railway service `agents-acceptance-once` (3023df8d…) still exists:
      delete-service timed out THREE times (MCP 60 s limit). Stop retrying it
      from the loop; the owner removes it in the dashboard (Settings -> Delete)
      or with `railway service delete`. It only idles.
- [ ] render `isolated-reader.test.ts` "a heap blown by one file" times out
      at 5 s in the cloud container, with or without this branch (checked by
      stash, tick 2). Pre-existing; the worker's heap ceiling is slow here.
- [ ] Someone else created `owner-noir-reel-once` (84bbe809…) on 24.09. Not
      ours: never touch it from this loop.

## Lessons (tick 2)

- A mutation that SURVIVES means the test was built on the easy case: the
  blank-browser test used a non-blank page. Build the case where the old and
  new code disagree, then mutate.
- `npx prettier` inside `apps/vibee-editor/render` is a NEWER prettier than
  the root one and rewrites `await import(...)` all over render-server.ts.
  Always format from the repo root.
- A new tool name is closed to clients automatically (client-facing.ts
  allowlist); a new `browser_*` joins the compact kit unless it is put in
  COMPACT_HIDDEN (budget 7000, at ~6996).

## Plan (next ticks)

- [x] Epic #2961: digital clone, every social network. Inventory done (only
      Telegram has an API; everything else goes through the owner's browser).
      Status tool #2962 done. Guided sign-in #2964 is a prompt line (done in
      chat.ts ownerSideSection) and needs a live A2A run: `tri a2a "подключи
  мои сети"` + `tri logins` before/after.
- [ ] job_hunters over crm_messages (deep history), with the same evidence rule.
- [ ] Competitor scan: agent marketplaces (what "hire an agent" products
      prove before selling an agent) -> gaps in our catalogue.

- 24.09.2026 07:25: Competitors (24.09): Twin (twin.so) — 'connected apps' per network (Instagram, X, LinkedIn, Facebook, TikTok), platform-optimised posts, schedule, publish to all; Meta AI Studio — creator clones answering DMs; agent marketplaces (AI Hive, MintMCP) sell on verified performance data (installs, ratings, audit trail). Our gaps: (1) no visible per-network 'connected' panel for the clone; (2) acceptance evidence is not shown on the agent card; (3) cross-posting exists only as blog-share. Sources: https://twin.so/use-cases/social-media-automation/ https://aihive.global/blog/ai-agent-marketplace/
