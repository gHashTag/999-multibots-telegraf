# Bot and Mini App conversation continuity

Issue: #2136. Dependency: PR #2130, initially e12798f9, then fast-forwarded to ccd4f1c2 (iOS-only additions; no overlap with this diff). Main inspected: b39b86ec6.

## Acceptance and plan

- [x] Fetch current changes, inspect instructions, preserve the dirty canonical checkout.
- [x] Inspect earlier chat/navigation changes and coordinate ownership in #2136 and #2130.
- [x] Offer a contextual `open_app` button for an allowlisted screen, without a payment or generation side effect.
- [x] Bot delivers inline buttons on the final answer chunk and retains a persistent APP entry.
- [x] Inline/direct app launches resolve chat, script, generation and profile tabs correctly.
- [x] Model context is read from the authenticated owner's server conversation.
- [x] Refresh/clear/account changes preserve conversation consistency and do not interrupt an active stream.
- [x] Run affected tests, typechecks, builds, isolated UI checks and independent review.
- [ ] Publish a scoped follow-up PR and report live verification limits.

## Evidence log

| Action                       | Result       | Observed evidence                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git sync                     | PASS         | Separate worktree; `git pull --ff-only origin main`; b39b86ec6 current main. Reused open #2130 via local fast-forward to e12798f9.                                                                                                                                                                                                  |
| Coordination                 | PASS         | Created #2136 and posted scope/ownership in #2130. Other agents' existing changes retained.                                                                                                                                                                                                                                         |
| Baseline live browser        | PARTIAL      | app.t27.ai/chat loads in BrowserOS; browser is anonymous, so this is not a signed owner smoke.                                                                                                                                                                                                                                      |
| New open_app regression      | EXPECTED_RED | 19 failures: tool absent, plus duplicate HIVE_TOOLS registration (58 entries, 55 unique).                                                                                                                                                                                                                                           |
| open_app implementation      | PASS         | 19 tests: allowlisted destinations only; arbitrary URLs/identity arguments rejected; no handler database calls. Duplicate registry insertion removed.                                                                                                                                                                               |
| Render install               | PASS         | Locked dependency installation completed. Verification uses installed Node 22.22.0.                                                                                                                                                                                                                                                 |
| Player install first attempt | FAIL         | npm registry read timed out; bounded retry uses Node 22 and local package cache.                                                                                                                                                                                                                                                    |
| Locked installs              | PASS         | root, render, player and shared atoms installed in the isolated worktree; verification on Node 22.22.0.                                                                                                                                                                                                                             |
| Bot delivery/navigation      | PASS         | 105 tests across ten files; actual middleware text/media delivery, final-chunk buttons, private-only guard, strict NDJSON parsing, persistent menu and bot/player route parity.                                                                                                                                                     |
| Blind guards                 | PASS         | Five intentional semantic mutations failed: private-chat check, two-button cap, tool event discriminator, history busy guard and owner cache partition. Changes restored.                                                                                                                                                           |
| Reviewer P1                  | CLOSED       | Anonymous/private cache leak reproduced, then fixed; anonymous fetch/send/clear/storage denied, history ownerId verified, expectedOwnerId mismatch rejected before model/delete. Independent rerun: 35/35, no remaining scoped P0/P1.                                                                                               |
| Player full tests            | PASS         | 341/341 after owner correction.                                                                                                                                                                                                                                                                                                     |
| Render full tests            | PASS         | 999 passed, 1 skipped, 0 failed. Initial unconstrained run had a poster subprocess timeout; isolated 5/5 rerun and full four-worker rerun passed without relaxing tests.                                                                                                                                                            |
| Types/builds                 | PARTIAL      | root typecheck/build and render production typecheck/bundle passed. Player build passed; raw tsc retains five existing errors (SoulEditor.setError and four uploadCarriesIdentity test types); repository ratchet passes at unchanged 5.                                                                                            |
| Browser fixtures             | PASS         | BrowserOS local-only API/model fixtures, external egress blocked. Shared bot text appears on focus; streamed response shows audio link, click lands on /generate/audio without generation. Widths 390/720/1440: no document overflow; CTA 44px high. Mobile screenshot inspected. This is not a real Telegram login/delivery smoke. |
| Staged hygiene               | PASS         | 37 owned paths; staged secret and Cyrillic guards, diff whitespace pass. Canonical dirty worktree unchanged.                                                                                                                                                                                                                        |

## Scope and remaining evidence

Navigation only opens screens. It must not advertise unsupported deep links to individual projects. Shared conversation remains owner scoped; this wave does not partition it by bot or device.

Deploy render before player: the new player requires ownerId in server history and sends the current user turn rather than trusting cached history. Then deploy the root bot for inline actions/menu setup. Backend remains compatible with older clients; the old backend is not a valid target for the new player's shared-history behavior.

Sync means final persisted text turns and attachment references, refreshed on focus/visibility, after completion and every ten visible seconds. Live tokens/tool traces and historical action metadata are not synchronized across devices. Local matching metadata is best-effort. Concurrent turns and timeout/retry fallback still need durable turn-id idempotency. Clearing shared history does not delete already delivered Telegram chat messages. Never import the old unowned browser cache into an authenticated account.

Real Telegram inline-button launch and two signed client messages require a release and an authenticated Telegram session. Tests use isolated data and mocked model/transport calls; they do not demonstrate a live paid generation. Parent PR #2130 has failing/skipped remote CI, so its production release is not implied by successful local follow-up checks.

Official Telegram contracts: https://core.telegram.org/bots/api#inlinekeyboardbutton and https://core.telegram.org/bots/webapps . Inline web_app buttons are private-chat only. The default chat menu can open the same Mini App with setChatMenuButton; reply-keyboard launch is not used.
