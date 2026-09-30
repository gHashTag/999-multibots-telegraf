# Loop "CRM on a phone" — journal

<!-- loop-branch: fix/crm-mobile-ux -->
<!-- loop-pr: 3199 -->
<!-- loop-tests: cd apps/vibee-editor/player && npx vitest run src/pages/Crm.test.tsx src/pages/CrmCockpit.test.tsx src/pages/CrmClient.test.tsx src/lib/crmRecent.test.ts src/lib/useScrollMemory.test.tsx src/lib/backTo.test.tsx src/pages/Chat.clientThread.test.tsx src/pages/chatClientRow.test.ts src/components/Crm/ClientAside.test.tsx src/lib/usePublishedHeight.test.tsx src/lib/crmMatches.test.ts src/lib/crmReason.test.ts -->

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
   `crm-mobile-mutants.json` with `tri mutants --adopt <batch.json>
<guards.json>`, run where the batch ran (tick 8: the hand copy once
   rewrote the whole list's indent): `loop-guard start` re-runs the whole list, so
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
- [x] Sticky finder and headings checked in the Telegram shell's scroller
      (html[data-tg=1], #root scrolls): finder at 0, heading at 114 while
      its rows pass (tick 11). A real iPhone is still the owner's to try
- [x] Contacts are one grouped surface on a phone, hairline past the face:
      pitch 74 -> 62 px, about one more person per screen (tick 11)
- [x] Search marks the typed letters; the fact they were found in comes
      first; a row found by id alone shows the id (tick 11)
- [x] `tri loop-guard end` runs the guards adopted this tick under the
      loop-tests marker (tick 11: three would have failed the next start)
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
- [x] Back loop (found tick 6, caused by tick 4): a chat opened from the
      threads, picker or map -> "to the client" PUSHED the card -> the card's
      Back (a real history step) returned to the chat -> loop, the list never
      reached. `useBackTo` steps back when the chat came from that card
      (`cameFrom`), else REPLACES the chat with the card; `firstEntry` state
      keeps the crumb from stepping out of the app
- [x] Client chat's top row at 390px: 490px wide, the page scrolled sideways
      to 502px, Queen off screen, targets 20/28px, title "Conversation about
      cli…". Now 390px, 44px targets, arrow-only back on a phone, the
      client's NAME in the title (read by the card beside it), Card+Queen
      together at the right (tick 6)
- [x] The name arrived ~1s late -- and not only the name. The card page
      and the card beside the chat read in parallel but DREW together,
      after the slowest read, under a comment claiming the opposite. Now
      each panel lands as its read answers (a late answer for the last
      client is dropped), and the card hands the name to the chat in link
      state: the title is right on the first frame (tick 7)
- [x] The card beside the chat had a second "open the card" link that
      still PUSHED: tick 6 fixed one of two links into the card, and the
      Back loop lived on through the other (tick 7; now `useBackTo`)
- [x] `tri loop-guard`: a stale mutation anchor used to warn and GO --
      tick 7 started with all 27 guards unchecked. Now STOP at start, and
      `end` keeps the lock until anchors match and the tree is clean.
      `tri mutants` keeps an edit made while a file held a mutant
- [x] Harness mounts the app's TelegramTabBar: without it the header's
      fallback bar covered the chat composer -- a harness-only overlap that
      read as a bug (tick 6)
- [x] AUTO pill took 73px of every 352px row at 390px: the name had 179px,
      4 of 12 names and 6 fact lines cut. On a phone the row keeps the
      tick alone (44px) and the list heading names the column once, aligned
      at 390 and 320. Name 179 -> 208px, fact lines cut 6 -> 4 (tick 8)
- [x] The AUTO column label scrolled away with its heading; a long list
      showed bare ticks. Each heading + its rows is a `<section>`; the
      heading is pinned under the finder (top = the finder's real height,
      `usePublishedHeight`) until its section ends, as in iOS contacts.
      Label and ticks share a centre at 390 (307) and 320 (247) (tick 10)
- [x] `tri mutants --adopt`: a proven batch into the guard list, re-rooted,
      deduplicated, anchors checked (tick 8)
- [x] Waiting row at 390px: Prepare + 3 outcomes needed 371 of 318px, one
      button wrapped alone, row 237px. The outcomes are one group that wraps
      whole: EN one line (237 -> 185px), RU Prepare on line 1 and outcomes
      in even thirds on line 2, nothing cut at 320. The first try was
      measured in English only and stretched a lone RU button (tick 9)
- [x] WORK tab in Russian: the stage ("t.me" + stage word, 131px) shared
      the name's line; a double-barrelled name got 131px. On a phone the
      stage is the name's subtitle, the face spans both: name 131 -> 272px
      at 390, row 36 -> 37px (tick 10; first try 52px -- grid row-gap)
- [x] `tri mutants --reanchor`: an indent-only move (code wrapped in one
      more element) re-anchors its guards; a changed token stays stale
      (tick 10)
- [x] Waiting "because" line is server text in Russian even in the English
      UI. The server now sends a code next to the words (`because_code`,
      `next_why_code` + `next_why_vars`); the screen translates a known
      code and shows the words for an unknown one. A contract test reads
      the codes from the server's own source (tick 12)
- [x] Recents ignore the chip: a paying client sat in "Recent" under the
      Leads chip. Recents now follow the chip (tick 12)
- [x] The age on a waiting row was a bare number ("9"); it says its unit
      now ("9 d" / "9 дн.") -- Pipedrive's "rotting N days" (tick 12)
- [x] Test-order leak in Crm.test: one test changed the shared `answers`
      and later tests saw it. `afterEach` restores a pristine copy (tick 12)
- [ ] The lead list's `because` (chat memory, `'давно тихо'` and friends)
      is still Russian prose on an English screen -- same cure: codes
- [~] `tri loop-guard start` took ~11 min: every guard runs the whole
  marker. The guards now run it with `--bail=1` (3 guards: 65 -> 43 s,
  same verdicts). Next step if still slow: each guard against its
  killing file first, the marker only for a survivor
- [ ] Server-side reason codes are held by 8 render mutants (8/8 killed,
      tick 12) that are NOT in the adopted list: the marker is player-only

## Что уже есть

- PR https://github.com/gHashTag/999-multibots-telegraf/pull/3199, branch
  fix/crm-mobile-ux. GitHub Actions are dead (billing): 12 red checks, same
  as main; the gates are local.
- Harness `apps/vibee-editor/player/harness/crm.html` +
  `src/harness/crmFixtures.ts`; `tri shot crm` needs chrome-headless-shell
  (no download without the owner's yes) -- otherwise the preview browser.
  The harness honours `?tab=&who=&q=` (tick 4); rows open the REAL card
  (tick 5 -- the stub hid the card's own scroll behaviour); the card's chat
  button opens the REAL client chat, under the app's own tab bar (tick 6).
- Measured at 390 px: search 1523 -> 149 px from the top; row 140-160 -> 64
  px; 3 -> 7 contacts per screen; page 3918 -> 1240 px.

- 01.10.2026 01:34: tick 2: recents shipped (e178d41b6); tsc -p . in the player is a no-op -> tri precommit player-types; an exit code proved nothing until the log was read

- 01.10.2026 01:44: tick 3: fixed the blind client-card harness first (you cannot improve a page you cannot see), then sticky chat button; media 'gap' was a deliberate 44px target -- measure before calling it a bug

- 01.10.2026 01:58: tick 4: Back from a card reset the list (sibling routes) and the crumb went to the work tab; state now in the address via useUrlMirror, crumb steps back. The owner's 'saved views' pain was per-visit, not per-day

- 01.10.2026 02:29: tick 5: card opened mid-page and Back lost the list's place (no route scroll handling anywhere); useScrollMemory saves in a layout cleanup (a scroll listener lost the race), restores after re-read; a stub card had hidden it -- harness mounts the real card now; loop-tests marker ends the hand-copied tests command

- 01.10.2026 03:03: tick 6: tick 4's real-Back crumb built a Back loop with the chat's pushing link (useBackTo/cameFrom, firstEntry state); chat top row widened the page to 502px -- min-width:0, 44px targets, client name in title; the harness lacked TelegramTabBar and faked an overlap

- 01.10.2026 03:26: tick 7: loop-guard warned-and-went on a stale anchor (27 guards unchecked) -> stop at start, end keeps the lock; Promise.all drew every panel after the slowest read -> each lands as it answers, name handed over in link state; tick 6 fixed 1 of 2 links into the card -> grep the route

- 01.10.2026 03:57: tick 8: the default item (140px top chrome) measured as not the pain -- the AUTO word on every row was: 73 of 352px; heading names the column once, name 179->208px. Hand-copying proven mutants into the guard list rewrote its indent -> tri mutants --adopt

- 01.10.2026 04:27: tick 9: waiting row's outcomes wrap as one group (EN 237->185px); first try fit English and stretched a lone Russian button across the row -- measure in the owner's language, scope grow rules to a group

- 01.10.2026 05:14: tick 10: WORK-tab waiting row puts stage under the name on a phone (grid, row-gap 0); contacts section headings pinned under the finder via usePublishedHeight (--crm-finder-h on parent); tri mutants --reanchor for indent-only moves; 57/57 guards killed. Open: waiting 'because' text is Russian server prose in EN UI; sticky unverified in the real Telegram #root scroller.

- 01.10.2026 05:41: tick 11: contacts are one grouped surface on a phone (pitch 74->62, +1 row); search marks its hit in name/facts, hit fact leads, id shown when found only by id; sticky verified in the tg #root scroller; loop-guard end now runs this tick's adopted guards under the loop-tests marker (caught 3 guards alive only in crmMatches.test.ts). 10/10 mutants killed, 67 adopted.

- 01.10.2026 06:19: tick 12: waiting reasons travel as codes (5 WaitWhy + 14 NextWhy), translated on the screen with the server's words as fallback; contract test reads the codes from the server source; age with its unit; Recent follows the chip; Crm.test pristine fixture reset; mock t now says 'found' for reason lines (a mutant hid behind it). Mutations 12/12 player adopted (79 guards), 8/8 render by hand. tri: loop guards run vitest with --bail=1 (65->43 s on 3).
