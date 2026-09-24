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
5. MERGE: owner, 24.09 ~08:00 UTC, in chat: «мержи сам все автоматически
   не спрашивай меня!!!» -- standing permission to merge this loop's PRs
   myself, without asking, ONCE local checks are green (the related vitest,
   tsc, check:player-types, mutations). Never merge red local checks, never
   force-push, merge commit (not squash) like #2952/#2960. After a merge:
   unsubscribe the PR, restart the branch from origin/main (fast-forward),
   watch the Railway deploy of vibee-render and vibee-editor to SUCCESS.
   Never read a secret value into the conversation (`${{service.VAR}}`
   references only).
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
- Tick 3 (24.09 07:50-08:40 UTC), same PR #2960: habr anomaly root-caused
  from the prod log (raw README 404, a guessed branch) -> web_read names
  404/410 and hints the repo page (474c888d); job_hunters reads the deep
  crm_messages history and survives a dead live session (bebfa519); market
  cards show the last acceptance verdict, `tri agents` records it
  (8ebbd525). Competitor gap (2) "acceptance evidence not on the card" done.
- 24.09 07:58 UTC: PR #2960 MERGED by me on the owner's word (e4db4eb5);
  deploy of vibee-render + vibee-editor started. Owner chose all three next
  options: (1) post-merge acceptance + connect-my-networks run, (2) Threads
  (and more) posting through the browser, (3) daily acceptance with alert.
- Tick 4 (24.09 08:00-08:40 UTC), owner: «все три тогда», then «мержи сам
  все автоматически». Done: merged #2960 myself; daily acceptance INSIDE
  render (2b2368c5) -- also covers option 1, the first run starts 10 min
  after the deploy since the table is empty; Threads in blog-share + skip
  signed-out networks (61676d3a); `tri verdicts`. NOT done: Instagram
  posting (needs a media upload through the web composer via CDP
  DOM.setFileInputFiles) -- next candidate. The Railway function
  `agents-acceptance-once` is NOT reused (skill cloud-agent-does-the-work:
  no one-off functions); it still idles until the owner deletes it.
- Tick 5 (24.09 08:07-08:20 UTC): self-critique of tick 4. The morning
  "5/5 PASS" hid a failure (Google Scout: no sources, search 402). Answer
  rules + `answer_shape` + table fingerprint -> PR #2969 merged (ca657a03).
  Deploys: #2968 SUCCESS 08:07; #2969 building 08:14. First in-service run
  expected ~08:25; check-in trig_01Dwv1Qk92fpWSFQyXoNRFZ8 at 08:32 reads the
  `[acceptance]` log. Expect google FAIL until BRAVE_SEARCH_API_KEY is set.
- Tick 6 (24.09 08:14-08:35 UTC), owner: «все три», then the Brave key and
  «помечать каждый маркетинговый канал». Merged: #2972 `tri secret`; #2973
  hire by evidence + a daily run that survives deploys; #2975 traffic tags
  (epic #2974); the Brave error-code log. BRAVE_SEARCH_API_KEY set on
  vibee-render from the chat value -> every search `brave HTTP 422`: the
  value is most likely not a Brave key (64 hex vs `BSA...`). Owner must
  re-issue it at api.search.brave.com and run `tri secret BRAVE_SEARCH_API_KEY`.
  NOT done: Instagram posting (option 2) -- carried to the next tick.
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
- [x] habr: raw.githubusercontent README answered 404 (prod log 07:18 UTC,
      "target returned 404") -- a guessed branch, not a broken reader. Fixed:
      the status is named and the repo page is hinted (tick 3).
- [x] job: job_hunters now reads crm_messages history first (tick 3). After
      merge, re-run `tri agents job` and compare `looked.history`.
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

## Lessons (tick 3)

- ROOT-CAUSE FROM THE PROD LOG BEFORE CODING. The habr anomaly looked like a
  proxy/guard problem; one Railway log query (`filter "[web]"`, the run's
  minute) said 404 in one line. `mcp__Railway__get-logs` with serviceId
  6339df9c... and a 15-minute window is the fastest check there is.
- A deny-by-default taint rule (web_read's offered set) must be taught about
  every URL the system itself derives; otherwise a helpful hint is a dead end.
- Measured beats described: the catalogue's `evidence` lines are design
  properties. Anything shown as proof on a card must come from a run.

## Lessons (tick 5)

- A "PASS" that only checks the form (a tool call, a non-empty answer) lies
  exactly when the agent is honest about failing. Check the substance the
  canary asked for, calibrated on real answers.
- NEVER run prettier over a glob (`src/agent/*.ts`): other sessions commit
  unformatted files, and a glob rewrites ten of them into my diff. Name the
  files. `git diff --stat` before every commit catches it.
- A stored verdict must say which rules made it (fingerprint), or a rule
  change silently leaves yesterday's verdict standing.

## Lessons (tick 6)

- A value the owner pastes is not proof of what it is. Probe it before
  wiring it in (the container could not reach Brave, so the service's own
  log became the probe) and make the failure name its reason.
- Busy main starves anything that waits after a start. Work that takes long
  must resume, not restart: record each step as it completes.

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
