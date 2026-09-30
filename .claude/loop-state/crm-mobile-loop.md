# Loop "CRM on a phone" — journal

<!-- loop-branch: fix/crm-mobile-ux -->
<!-- loop-pr: 3199 -->

Started 30.09.2026 by the owner's `/loop 30m`: find the weak spots of mobile
layout and UI/UX, study competitors, write a decomposed plan, implement it,
report with three options; autonomous; a new tick must not break the last
one; self-critique, anomaly hunting, self-healing; grow `tri` and the skills.

Worktree: `~/crm-mobile-ux` (not the main checkout). Every tick:

```
cd ~/crm-mobile-ux
TRI_LOOP=crm-mobile ./bin/tri loop-guard start --tests \
  "cd apps/vibee-editor/player && npx vitest run src/pages/Crm.test.tsx src/pages/CrmCockpit.test.tsx"
TRI_LOOP=crm-mobile ./bin/tri loop
... work ...
TRI_LOOP=crm-mobile ./bin/tri loop-note "what was learned"
TRI_LOOP=crm-mobile ./bin/tri loop-guard end
```

(The two Russian section headers below are read by `tri loop`; keep them.)

## Tick rules (do not break past work)

1. `loop-guard` says STOP: fix the reason first. Uncommitted files = the last
   tick died mid-edit: finish or revert, never start alongside. PR merged =
   the next item goes on a fresh branch from main; update `loop-branch` and
   `loop-pr` above.
2. One plan item, one commit. Commit and push through
   `CHECKS_LOCAL=1 env -u LOG_LEVEL -u log_level -u OPENAI_API_KEY -u OPENAI_API_BASE -u OPENAI_BASE_URL -u WHISPER_API_KEY git ...`;
   judge by git's exit code, not a pipe's. No force push, ever.
3. jsdom cannot see a phone. Any layout or focus change is checked live in
   the preview at 390x844 (`/harness/crm.html`) before the commit. In tick 1
   jsdom said "focus is in the box" while the browser said BODY: no iOS
   keyboard.
4. Every new test is proven by a mutation: break the line, see red, restore.
5. Cyrillic in a code regex only with a `// cyrillic-ok` marker on the same
   line (the no-cyrillic gate).
6. Player lint: 3 errors in Crm.tsx (117, 126 fast-refresh; 254 setState in
   an effect) and the unused `heading` in CrmCockpit.test exist on main and
   are not ours. No new ones.
7. Everything authored is English (skills, docs, `tri` strings, commits);
   only text a bot user reads is Russian. Tick 1 slipped here and caught it
   before the commit.

## СЕЙЧАС В РАБОТЕ

(empty -- tick 1 closed)

## Plan (competitors: Pipedrive, HubSpot, Kommo; Telegram Mini Apps guide)

- [x] Contact search at the top, 64 px rows, 7 contacts per screen (cf976f29d)
- [x] Keyboard rises on the first tap: a field as the entry, not a button (9d8dd50fe)
- [x] Clear and chips keep the keyboard up (pointerdown preventDefault)
- [x] "More clients" stays out of an answered search
- [x] `tri loop-guard`: a tick cannot land on top of the last one
- [ ] Section strip starts at x=26, content at x=12: align the insets
- [ ] Stats row is clipped on the right at 390 px: wrap or scroll
- [ ] Recent contacts in an empty search (localStorage; HubSpot's "Recent")
- [ ] Search by @username and phone, not only the name (Pipedrive searches every field)
- [ ] Height from `--tg-viewport-height`, not 100vh; safeAreaInset / contentSafeAreaInset
- [ ] Every CRM input at font-size >= 16px (iOS zooms the page otherwise)
- [ ] Contact card `/crm/:id`: big "write / take on" actions at the bottom, under the thumb
- [ ] Quick filter "views" persist between visits (Pipedrive saved views)

## Что уже есть

- PR https://github.com/gHashTag/999-multibots-telegraf/pull/3199, branch
  fix/crm-mobile-ux. GitHub Actions are dead (billing): 12 red checks, same
  as main; the gates are local.
- Harness `apps/vibee-editor/player/harness/crm.html` +
  `src/harness/crmFixtures.ts`; `tri shot crm` needs chrome-headless-shell
  (no download without the owner's yes) -- otherwise the preview browser.
  The harness ignores `?tab=`: switch sections by tapping.
- Measured at 390 px: search 1523 -> 149 px from the top; row 140-160 -> 64
  px; 3 -> 7 contacts per screen; page 3918 -> 1240 px.
