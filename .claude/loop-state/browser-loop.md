# AI browser + agent/person handoff + Telegram userbot night loop (2026-10-03)

<!-- loop-branch: feat/browser-userbot-loop -->
<!-- loop-not-mine: .claude/launch.json -->

**Owner since 2026-10-06: the Queen.** The scheduled round
`queen-browser-social-round` (agent `.claude/agents/browser-desk-keeper.md`,
every 2 h) takes the next unchecked items below, at most two coder bees per
round, and ticks them off in the bee's own PR. The local cron 8eb28a55 that
started this plan is retired. Older tick recipe, kept for a hand-run tick:
`TRI_LOOP=browser ./bin/tri loop` -> `TRI_LOOP=browser ./bin/tri loop-guard start`
-> one plan item -> commit by name -> `TRI_LOOP=browser ./bin/tri loop-guard end`.
One item per tick; a tick that finds the tree dirty finishes or reverts first.
Never: post to his networks, run `tidy apply`/`blog-share reoffer --apply`,
send real cards (`ask`, `tidy ask`) without a reason written here first.

## СЕЙЧАС В РАБОТЕ

2026-10-06: coder bees on A, B, D resumed (their worktrees held uncommitted
work after a session restart); N1 and N2 dispatched. Every PR carries
`owner-approved-foreign` with the owner's chat approval of 2026-10-06 quoted.

## Что уже есть

browser_tidy (#3406), desk ask (#3503), frames (#3507), hit-test (#3515),
watch-only link (#3510), probe reads (\_meta.probe), per-question TTL (#3235).

## План

Sources: browser audit (B#), userbot audit (U#), competitors (C#) -- tick 1, 03.10.
Each item = one coder bee (worktree) -> one PR -> a DIFFERENT reviewer bee merges.

- [ ] A. Userbot errors (U3,U4): gramjs FloodWaitError text ("A wait of N seconds"), PEER_FLOOD,
      AUTH_KEY_UNREGISTERED/SESSION_REVOKED/AUTH_KEY_DUPLICATED/USER_DEACTIVATED in plain words;
      floodSleepThreshold 5; client() tells "session dead" only on auth codes, a network error is "temporary".
- [ ] B. One yes unlocks every guarded site (B3,U6): markAllowed only for act-kind approvals, bound to the host.
- [ ] D. crm_duet sends for real by default (U1): dry_run defaults to true.
- [ ] C. Wheel after the person types (B2) + Telegram Allow hands the wheel back like the app (B5) + browser_status shows wheel / waitingOn (B6).
- [ ] E. closePage throws on !ok, browser_close_tab refuses the last tab, focus_tab is an acting tool (B7,B8).
- [ ] F. A late answer wakes the agent (B1) + ask_permission returns id and reuses an open same question (B4).
- [ ] G. Failed confirm does not restore dead buttons (U2) + bot->render post timeout (U7).
- [ ] H. Telegram ask failure surfaced: notified:false (B11, U6 silent sender).
- [ ] I. Userbot liveness: last_ok/last_error, owner told once on revocation, `tri userbot` (U5).
- [ ] J. Owner typed by hand in a business DM -> agent quiet there 30 min (C1).
- [ ] K. Old "Ввести" deep link bound to the request id (B10); health.ts blank-tab leak (B9).
- [ ] L. Journal/report words for ask_input/focus_tab/tidy + site on clicks (B12); stale "not built" notes (B13).
- [ ] N. The agent starves for a model (measured 2026-10-06, see Журнал): N1 the Zep relay yields
      to the agent (in-flight cap 1, 3 s gap, own key `ZAI_RELAY_API_KEY`); N2 zai-lite on its own
      key `ZAI_LITE_API_KEY`; N3 after both deploy, set the keys (owner said yes 06.10): relay +
      Zep `ZEP_OPENAI_API_KEY` = account 3 together, lite = account 2; N4 top up `reserve` (owner).
- [ ] M. Telegram start card: "take the wheel" / "pause" buttons (B14, C3/C4).

## Журнал

- 2026-10-06. Owner: "why does browser work stall?" The browser was healthy (pod up 49 h,
  8 networks signed in). The AGENT starved: render logs 05:00-11:32 UTC, 15 of 45 turns
  `outcome:error`; zai 429 x33, reserve "no funds" x19, nemotron "16/16 workers" x16,
  zai-lite "talked instead of calling" x18. Zep memory made 630 relay calls (~97/h, bursts
  of 15-30) on the agent's own z.ai key. Probes: production key -> 1302 (per-key limit) 3/3
  even on glm-4.5-flash; three other accounts -> 200 on glm-4.5-flash; glm-4.7-flash ->
  1305 (model overloaded, any key) on 3 of 4. Lesson: when "the browser stalls", read the
  agent's provider lines first -- `[agent] provider skipped` and `"outcome":"error"` in
  `railway logs --service vibee-render --environment production --lines 5000`.

## Competitors (tick 1, 03.10 research; sources in the tick-1 report)

Cheap mechanisms we likely lack, ranked:

1. Userbot/business DM: owner typed by hand in a chat -> agent quiet there N min (Chat Data, Telegram toggleConnectedBotPaused).
2. Handoff outcome: Done / Failed(reason) + per-handoff timeout up to 30 min (Cloudflare Browser Run handoff API).
3. Watch Mode on sensitive sites: pause when the person's app tab is hidden (Atlas; untested there).
4. Timeout escalates and parks the task, does not fail it (Manus take-over notifications).
5. Action-only critic + after N vetoes fall back to ask-every-step (Gemini UAC, Claude in Chrome).
6. Task origin set: navigation off the derived domains needs a check (Gemini Agent Origin Sets).
7. Model-generated URLs / "user already agreed" page text untrusted (Dia, Comet).
8. Per-step screenshot timeline; userbot send queue ~1 msg/s/chat + jitter + cached resolveUsername + one-tap revoke (Telethon practice).
