# AI browser + agent/person handoff + Telegram userbot night loop (2026-10-03)

<!-- loop-branch: feat/browser-userbot-loop -->
<!-- loop-not-mine: .claude/launch.json -->

Cron 8eb28a55, every 15 min. Run each tick as
`TRI_LOOP=browser ./bin/tri loop` -> `TRI_LOOP=browser ./bin/tri loop-guard start`
-> one plan item -> commit by name -> `TRI_LOOP=browser ./bin/tri loop-guard end`.
One item per tick; a tick that finds the tree dirty finishes or reverts first.
Never: post to his networks, run `tidy apply`/`blog-share reoffer --apply`,
send real cards (`ask`, `tidy ask`) without a reason written here first.

## СЕЙЧАС В РАБОТЕ

Tick 1: coder bees on A, B, D (disjoint files).

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
- [ ] M. Telegram start card: "take the wheel" / "pause" buttons (B14, C3/C4).

## Журнал

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
