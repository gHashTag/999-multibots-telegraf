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
agents`, this memory file. Branch claude/vibrant-heisenberg-bijrhv.

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
      delete-service timed out twice. It only idles. Delete it next tick.

## Plan (next ticks)

- [ ] Epic: digital clone - every social network of the owner connected
      (owner, 24.09: "connect all my social networks so the digital clone
      deserves the name"). Inventory -> status tool -> guided sign-in with
      browser_ask_input (the owner types passwords himself).
- [ ] job_hunters over crm_messages (deep history), with the same evidence rule.
- [ ] Competitor scan: agent marketplaces (what "hire an agent" products
      prove before selling an agent) -> gaps in our catalogue.

- 24.09.2026 07:25: Competitors (24.09): Twin (twin.so) — 'connected apps' per network (Instagram, X, LinkedIn, Facebook, TikTok), platform-optimised posts, schedule, publish to all; Meta AI Studio — creator clones answering DMs; agent marketplaces (AI Hive, MintMCP) sell on verified performance data (installs, ratings, audit trail). Our gaps: (1) no visible per-network 'connected' panel for the clone; (2) acceptance evidence is not shown on the agent card; (3) cross-posting exists only as blog-share. Sources: https://twin.so/use-cases/social-media-automation/ https://aihive.global/blog/ai-agent-marketplace/
