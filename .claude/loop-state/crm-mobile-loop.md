# Loop "CRM on a phone" — journal

<!-- loop-branch: fix/crm-mobile-ux -->
<!-- loop-pr: 3199 -->
<!-- loop-tests: cd apps/vibee-editor/player && npx vitest run src/pages/Crm.test.tsx src/pages/CrmCockpit.test.tsx src/pages/CrmClient.test.tsx src/lib/crmRecent.test.ts src/lib/useScrollMemory.test.tsx -->

Started 30.09.2026 by the owner's `/loop 30m`: find the weak spots of mobile
layout and UI/UX, study competitors, write a decomposed plan, implement it,
report with three options; autonomous; a new tick must not break the last
one; self-critique, anomaly hunting, self-healing; grow `tri` and the skills.

Worktree: `~/crm-mobile-ux` (not the main checkout). Every tick:

```
cd ~/crm-mobile-ux
TRI_LOOP=crm-mobile ./bin/tri loop-guard start   # tests: the loop-tests marker above
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
4. Every new test is proven by a mutation -- with `tri mutants`, not by
   hand (tick 4 hand-rolled it a third time). Add each proven mutation to
   `crm-mobile-mutants.json`: `loop-guard start` re-runs the whole list, so
   a later tick that weakens a past guard is stopped, not merely green.
   A new test file goes into the `loop-tests` marker in the same commit,
   or its mutations read as survivors next tick (tick 5).
5. Cyrillic in a code regex only with a `// cyrillic-ok` marker on the same
   line (the no-cyrillic gate).
6. Player lint: 3 errors in Crm.tsx (fast-refresh x2, setState in an
   effect), 1 in CrmClient.tsx (setState in an effect) and the unused
   `heading` in CrmCockpit.test exist on main and are not ours; line numbers
   drift with edits. No new ones.
7. Types: `npx tsc -p .` in the player checks NOTHING (solution tsconfig).
   Run `./bin/tri precommit player-types` (the real gate, ~10 s) before
   committing. Tick 2 lost a commit to this.
8. Everything authored is English (skills, docs, `tri` strings, commits);
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
- [x] Section strip and funnel row start in line with the page and run to the edge (tick 2)
- [x] Funnel row clipped at 390 px: bleeds to the edge with a fade (same commit)
- [x] Recent contacts in an empty search (e178d41b6). Limit: only people on the
      first page of the list (100) are offered back
- [x] "@lapin" finds people and groups (one `searchNeedle`). Phone: there is
      no phone field in crm_people -- nothing to search, dropped
- [x] Height/safe area: already solved at the shell (styles/telegram.css
      --app-safe-\*); /crm has no 100vh. Tick 1 planned it without looking
- [x] Inputs >= 16px: already solved, styles/design-system.css:527
      (pointer: coarse). Same planning slip
- [x] `tri precommit [gate]`: the commit's gates without the commit
- [x] Harness /harness/crm-client.html drew "session refused" outside `tri shot`;
      now answers in-page from crmClientFixtures.json (f2749188e, tick 3)
- [x] Contact card: the chat button follows every panel, sticky 12px above
      the tab bar / home indicator (963ce987f). There is no "take on" action
      on the card to move -- the card only reads; one button was the scope
- [ ] Media rows look padded at 390px: NOT a bug -- the file link is a 44px
      touch target on purpose. Leave it (tick 3 false alarm)
- [ ] Sticky finder and sticky chat button are proven in the harness only;
      the real shell's scroll container is unverified on a phone
- [x] Back from a contact returns to the list as it was left: search and
      chip in the address (?q=, ?who=), the card's crumb steps back instead
      of linking to the work section (4736b9659, tick 4). This was the real
      "saved views" pain -- the state was lost on every card visit, not
      between days. Cross-visit memory (localStorage) is NOT done: a link
      is shareable and cannot leak on a shared device; revisit only if the
      owner asks
- [x] Scroll: a card opened from a scrolled list started 497 px down (crumb
      off screen); Back put the list at the top, the tapped row 1231 px away.
      Now the card starts at its top on a tap, and Back restores the list
      once it is re-read -- window and Telegram's #root alike (tick 5,
      `useScrollMemory`). Measured live: crumb -485 -> 12; row 1231 -> 734
- [ ] Recents ignore the chip (leads chip still shows a client in Recent).
      Deliberate for now (HubSpot recents are filter-free); watch for
      confusion

## Что уже есть

- PR https://github.com/gHashTag/999-multibots-telegraf/pull/3199, branch
  fix/crm-mobile-ux. GitHub Actions are dead (billing): 12 red checks, same
  as main; the gates are local.
- Harness `apps/vibee-editor/player/harness/crm.html` +
  `src/harness/crmFixtures.ts`; `tri shot crm` needs chrome-headless-shell
  (no download without the owner's yes) -- otherwise the preview browser.
  The harness honours `?tab=&who=&q=` (tick 4); rows open the REAL card
  (tick 5 -- the stub hid the card's own scroll behaviour).
- Measured at 390 px: search 1523 -> 149 px from the top; row 140-160 -> 64
  px; 3 -> 7 contacts per screen; page 3918 -> 1240 px.

- 01.10.2026 01:34: tick 2: recents shipped (e178d41b6); tsc -p . in the player is a no-op -> tri precommit player-types; an exit code proved nothing until the log was read

- 01.10.2026 01:44: tick 3: fixed the blind client-card harness first (you cannot improve a page you cannot see), then sticky chat button; media 'gap' was a deliberate 44px target -- measure before calling it a bug

- 01.10.2026 01:58: tick 4: Back from a card reset the list (sibling routes) and the crumb went to the work tab; state now in the address via useUrlMirror, crumb steps back. The owner's 'saved views' pain was per-visit, not per-day

- 01.10.2026 02:29: tick 5: card opened mid-page and Back lost the list's place (no route scroll handling anywhere); useScrollMemory saves in a layout cleanup (a scroll listener lost the race), restores after re-read; a stub card had hidden it -- harness mounts the real card now; loop-tests marker ends the hand-copied tests command
