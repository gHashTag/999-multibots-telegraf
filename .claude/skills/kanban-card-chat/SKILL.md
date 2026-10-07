---
name: 'kanban-card-chat'
description: 'Tap any card on the game kanban (app.t27.ai/game/kanban) and a chat with the agent opens with the task history, so the person can write and continue the task; the same thread is shared with every A2A agent. Use when touching the kanban card click, the task thread (task:<owner>/<repo>#<n>), the card-chat sheet in the Hive, A2A contextId for a task, or `tri card` / `tri card-check`, or /api/card-status.'
---

# Kanban card chat

## When to Use This Skill

- A card on `/game/kanban` should open something other than GitHub.
- A task needs a conversation with the agent that survives reloads and devices.
- An outside A2A agent should continue the same task the person sees.
- `tri card <n>` misbehaves, or the card-chat sheet is blank.

## READ FIRST, EVERY LOOP ITERATION

The work is done by a recurring loop (15 min cron). Each pass:

1. Read `STATE.md` next to this file. Steps marked `[x]` are DONE -- do not
   redo them, do not rewrite their files from scratch; extend them.
2. `git log --oneline -15` on branch `claude/kanban-chat-agent-history-4353da`
   -- the commits are the truth if `STATE.md` disagrees. Fix `STATE.md`.
3. Self-audit the last step: run its test, look for the anomaly the step was
   meant to remove, and write what was found under `## Anomalies`.
4. Do the next unchecked step, commit, tick it in `STATE.md`, commit again.
5. Never merge to `main` (it auto-deploys prod) and never bump `QUEEN_REF`
   without the owner. Open PRs and keep them green.

## Who runs the round (since 2026-10-03)

The loop is now a Queen round, run by the profile agent
`.claude/agents/queen-card-chat-keeper.md` (and the scheduled task
`queen-card-chat-round`). The Queen manages: numbers rules go to the Queen's
engine as gHashTag/t27 issues (#5700, #5701 so far), 999 code goes to coder
bees, reviewer bees merge, and every check runs on Railway via
`tri remote-check`. How a round is run lives in that agent file only.

## The design in one screen

```
trinity Queen.tsx KanbanView          999 player Hive.tsx (app.t27.ai/game)
  card tap ──postMessage──────────────► {v:1,type:'t27-app',kind:'open-card',
  (GitHub stays as a small link)         repo,number,title,column}
                                         │  fallback: capture-click on
                                         │  github.com/<repo>/issues/<n> anchors
                                         ▼  in the same-origin frame
                                       CardChatSheet (DetentSheet half/full)
                                         │ address: /game/kanban?card=<n>
                                         ▼
render /api/agent/chat {task:'gHashTag/trios#3587'}  ──► thread task:gHashTag/trios#3587
render /api/agent/history?task=...                       (agent_messages, per person)
render /a2a message/send metadata.task | contextId=task:... ──► same thread
```

The numbers and shapes live in ONE place: the `.t27` spec
`specs/automation/kanban-card-chat.t27` (gHashTag/t27), copied to
`apps/vibee-editor/render/src/spec/` with `t27c gen-ts`.

## Traps found so far

- The board is built from gHashTag/trinity at a pinned `QUEEN_REF`
  (`apps/vibee-editor/Dockerfile`). A trinity change reaches prod only with a
  bump of that ref. Until then the player-side anchor interceptor is what
  makes the tap work.
- The frame is same-origin (`/queen/` on app.t27.ai). `answerIdentityRequests`
  in `player/src/lib/hive.ts` demands `event.origin === 'https://t27.ai'`. Not a
  defect (checked 2026-10-01): on app.t27.ai the board reads the app session
  directly (trinity `appSessionIdentity.ts`) and never asks. Any NEW message
  from the frame checks `event.origin === location.origin` and `event.source`.
- **Prettier moves a trailing `// cyrillic-ok` onto the closing `)` line** of a
  wrapped call, and the guard then blocks the call's first line. Alias the
  Cyrillic helper once (`const recordTurn = conversation.записатьРеплику //
cyrillic-ok`) and call the English name.
- **The board's half (S8):** trinity `src/lib/queenCardChat.ts` posts the
  envelope only when `window.parent.location.origin` is readable and equal
  (cross-origin read throws); test `npm run test:card-chat`.
- `/Users/playra/trinity` main checkout has someone's uncommitted work: use a
  separate worktree off `origin/main`.
- `t27c test-report` exits 0 on FAIL: read the table.
- A2A `TASKS` in `a2a.ts` is in-memory (500 cap, lost on deploy). Persist the
  conversation in `agent_messages`, not in that map.
- `splittable()` threads only: `self`, `agent:*`. A task thread is one
  conversation, it does not split.
- **Spec tests are numbers and booleans only.** t27c's Zig backend refuses
  `==` on `[]const u8`; `test-report` then says BLOCKED, not FAIL. Pin string
  values in the host test (`render/src/spec/kanban-card-chat.test.ts`); rank
  enums as `u8` constants (`DETENT_*_RANK`).
- **Committing in the t27 checkout:** `.githooks/pre-commit` calls whatever
  `tri` is first on PATH, and both 999's and trios' `tri` reject `hooks`.
  Commit with `PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin
TRI_T27C=<t27c>` and add a `docs/now/<date>-<slug>.md` entry. A t27c with
  `gen-ts` builds from the t27 checkout's `bootstrap/` (`cargo build --release
--offline`); pass it to the sync script as `T27C=`.
- **The player cannot import render.** Its build stage sees only `player/`, so
  the gen module is byte-copied to `player/src/spec/` and held equal by
  `cardChat.test.ts` (the Dockerfile's test stage copies `render/` for such
  reads). Both copies are in `.prettierignore`.
- **A long issue title pushed the column out of the task note.** The note is
  fenced and capped at `NOTE_MAX`; the title is capped at `TITLE_MAX` first.
  The spec test is what caught it -- keep the hostile-title case.
- **The live render predates task threads until this PR deploys:** it ignores
  `?task=` and answers with the person's `self` thread. `tri card` checks the
  answered `thread` and sends nothing unless it starts with `task:` (exit 2).
  Any client that writes to a card must do the same check.
- **`tri`'s vault lookup:** logged-out `infisical` used to wait forever for an
  interactive login, or print a notice that went out as `X-Agent-Key`. It is
  now bounded (`TRI_VAULT_TIMEOUT_S`, 20 s) and shape-checked. Key for a run:
  `railway variables -s vibee-render -e production --kv`, `AGENT_KEYS`, first
  entry up to `:`, into `AGENT_KEY` -- never printed.
- **The sheet's work strip (v2) reads GitHub from the person's client.**
  Render has no GitHub token, so PRs and checks come from the public API (60
  reads/hour per address, `x-ratelimit-reset` exposed by CORS). A refused read
  is `unmeasured` with a retry time -- never "no PR" (UNMEASURED_IS_NOT_NONE);
  an unmeasured answer is never cached. The column is the Queen's verdict:
  there is no move button and the prompt (`KANBAN_LIMITS`) forbids promising
  one. Actions are agent cards, run only on the person's tap.
- **GitHub's issue timeline runs OLDEST first** (v3). One page shows the
  oldest PRs; the newest -- the ones that matter -- are on the LAST page.
  Read page 1 and the `Link` rel="last" page (per_page=100); the middle is a
  floor ("at least N more"), and a partial read never says "no PR".
- **Checks in one read** (v3, CHECKS_ONE_READ):
  `repos/<r>/commits/refs/pull/<n>/head/check-runs` -- not `pulls/<n>` for
  the sha first. One open costs <= READS_PER_OPEN_MAX (4) of the 60/hour.
  `tri shot` routes must match the same path, or the checks fall into the
  403 stub and the shot is green with no dots -- look at the PNG.
- **Render's binding test imports player modules by relative path**
  (`../../../player/src/lib/cardStatus`) -- so `cardStatus.ts` and
  `agentCards.ts` must keep relative imports only, no `@/`.
- **The server door is a shortcut, never a dependency** (v4). Without
  `GITHUB_READ_TOKEN` it answers 503 and the client reads as before; a
  `measured:false`, a 404 (old render), a non-JSON body or a status without
  `prs` all fall back. Never trust a door answer that is not `measured`.
- **No move button until the Queen's ONE-card door is MERGED.** The column
  is computed (registry -> dispatch verdict -> open issue); `PUT
/queen/registry` replaces every task, and a sheet using it races every
  writer. The door is gHashTag/BrowserOS#519 (`POST /queen/move`, table
  `queen_card_move` keyed (repo, number)). Only two moves are a person's:
  backlog/blocked -> dropped, and taking a person's own drop back. The drop
  is read by BOTH the board and the round's candidates, because the tick
  takes every open issue and a board-only drop would draw "dropped" while a
  bee was handed the card. Flip `MOVE_DOOR_EXISTS` only after #519 is merged
  AND `QUEEN_REF` is bumped. Contract: spec v4 MOVE\_\*,
  `player/src/lib/cardMove.ts`.
- **`tri card-check` has four verdicts.** The 4th, parity, is
  `render/scripts/card-status-parity.ts`. It sends the server's
  `CARD_STATUS_QUERY` to live GitHub (the gh token, reads only) and compares
  the result with the client's v3 read of the same card. If they differ, the
  door and the sheet disagree, even while the door has no token.
- **iOS: the same card, the same thread.** In `HiveScreen` (Kanban panel),
  a card tap opens `AgentChatView(task:taskTitle:)` as a sheet keyed by
  `OpenCard.id` = `<owner>/<repo>#<n>`. Writing stays locked until the
  history answers `thread == task:<ref>`. An older render answers `self`, and
  a turn written then would land in the person's own chat
  (`threadAnswered`). Tests: `VibeeTests/CardChatTaskTests`.
- **The agent key for live GETs** lives in vibee-render `AGENT_KEYS`
  (`key:id[,..]`). Pass it as `AGENT_KEY=$(... | cut -d: -f1) tri card-check`
  for one run; never write it to a file or print it.
- **`tri shot` stubs every `api.github.com` read as over the limit** unless
  the harness routes it; a stub must send the CORS expose list GitHub sends,
  or the browser hides the very header under test.
- jsdom frames in `Hive.test.tsx` have a stub `contentDocument` without
  `addEventListener`; `catchCardTaps` checks the function before listening.

- **Live thread = signal, not payload (v5).** The SSE door sends rows, but
  the sheet only uses the id: it re-reads the history and merges with
  `shouldAdoptHistory`, so the person's own optimistic turns are never
  doubled. While the sheet's own answer streams, the re-read waits (a
  `pending` ref flushed when `busy` falls). The bus is in-process; another
  replica's write arrives through the 15 s recheck.
- **The move button is dark by construction.** `readMoveOffer` returns false
  WITHOUT a request while `MOVE_DOOR_EXISTS` is false; flipping it is a spec
  version (v7), not a code edit. The Queen's door admits only a Bearer
  `TRIOS_API_TOKEN` from off-box, so the browser can never call it directly
  -- render proxies, a keeper only.
- **The agent at work = names only (v6).** The live door also sends
  `event: work` (`{kind, name?}`): thinking, a tool by name, writing, done.
  Never the agent's words, never the tool's arguments, never stored. Wrap
  every `runAgent` that may run on a task thread in `announcingWork` (the
  chat route and both A2A paths do); it no-ops off `task:` threads and
  announces DONE in `finally`. While the sheet streams its own answer it
  shows tool lines only -- the bubble already says "Thinking...".
- **Cyrillic event keys in tests.** Agent events are `{ тип, имя, текст }`;
  the guard blocks Cyrillic identifiers, so build them with computed string
  keys (`{ ['тип']: kind }`) in a helper, not object-literal keys.
- **Typing a vitest mock's parameter** (`vi.fn((url: string) => ...)`) can
  raise TS2493 on `mock.calls[0][0]`; read calls via `String(call[0])`.
- **t27 commits need the repo's own `tri`.** The hook runs `tri hooks
pre-commit`; an older `tri` says "unknown command: hooks". Build it:
  `nice cargo build --release -p tri --offline`, then commit with
  `PATH="$PWD/target/release:$PATH"`.
- **iOS "system shell probably crashed"** is the simulator: `simctl shutdown`,
  `boot`, `bootstatus -b`, then `test-without-building` -- 22/22.

- **The bee's own log (v7) is not the chat agent's work (v6).** v6 names the
  tools of the agent answering IN the sheet. The bee a Queen round dispatched
  onto the card writes elsewhere: the Queen's `/queen/feed/data?issue=N`
  (Bearer `TRIOS_API_TOKEN`, trios-agent-server). Render proxies it as
  `GET /api/card-work` (`render/src/agent/card-work.ts`); without the token
  on vibee-render it answers 503 and the sheet says "not connected" --
  never "no bee". Rows are ONE attempt (the newest conversation), resumed
  by `conversation` + `since`; a new attempt resets the list.
- **Two faces, chosen by the column.** A running card opens on "Bee at work"
  at FULL (`BEE_FACE_FIRST_RUNNING`, `BEE_FACE_DETENT`): `tri shot
card-chat-bee` at HALF showed two lines of log. Sending a message flips to
  the chat (`SEND_SHOWS_CHAT`). Tests that open a `running` card must click
  `#card-chat-tab-chat` before looking for chat turns.
- **`SPEC.COL_*` are numeric ranks**, not the board's column names: compare
  through `columnCode(card.column)` (`lib/cardMove.ts`), never
  `card.column === SPEC.COL_RUNNING` (always false, and tsc does not say so
  when `column` is `string`).
- **Fixture paths look like citations.** `check-t27-specs.mjs` reads any
  `specs/<dir>/<name>.t27` string as a spec citation (law `cited`). Fixture
  data (paths a bee worked on) drops the `specs/` prefix.
- **player-lint ratchet (pre-push):** a hook exported from a component file
  breaks `react-refresh/only-export-components`, and `ref.current = x` in
  render breaks `react-hooks/refs`. Hooks go in `player/src/hooks/`; refs are
  written in an effect. Run `npx eslint <files>` in `player/` before pushing.

## Speed: `tri card`

```bash
tri card 5382                    # the card, its column, the last 12 turns
tri card t27#5382 "what's left?" # say it; the agent's answer streams back
```

Same thread as the sheet and A2A; turns are marked surface `agent`, so the
sheet shows them as "via another agent".

## The two standing checks (every loop starts here)

```bash
tri card-check                # live, GETs only: thread, status door, merges
tri card-drift --dry          # nightly drift verb, writes nothing with --dry
tri card 5382                 # live: 0 task thread, 2 render still answers self
tri shot card-chat 390 ru     # phone: the real sheet, doors answered by routes
tri shot card-chat-empty 320 ru
tri inflight                  # what is moving; last line = the jam summary
tri jam                       # each open PR: jam case + action; rc 1 = dispatch, 2 = unread
```

What the Queen does with each `tri jam` line has one home: skill
`continuous-improvement-loop`, "The Queen's round".

`tri shot all` walks every harness, so the card sheet is on it without a
list to keep. What the phone found on 2026-10-01 and the jsdom guard that
holds each fix (`CardChat.test.tsx`): the title was one cut line in the
peek (now a two-line disclosure, `aria-expanded`); the handle said number
and title a second time above PEEK (`DetentSheet compactHandle`, +28 px to
the body); the 320 px repo pill was cut (repo name only, the meta row
wraps); a short log floated at the top (`margin-top: auto` on the first
turn). Recipe and traps: skill `phone-shot`.

## The nightly look: `tri hive-nightly`

```bash
tri hive-nightly --dry           # drift + live card-check, writes nothing
tri hive-nightly --dry --shots   # + every phone stand (slow: ~1 min each)
```

Without `--dry` a regression opens or comments ONE issue in the EPIC repo,
matched by title prefix; an unmeasured night (no agent key, 401) leaves it
as it is. The scheduled task `card-drift-nightly` runs it.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.

## Related Resources

- `STATE.md` -- the loop ledger.
- `docs/research/kanban-card-chat-competitors.md` -- how Linear, Copilot,
  Codex, Devin, Cursor, Jules do it.
- Skill `t27-spec-first` -- binding the spec.
- Skill `links-open-in-telegram` -- deep links to a card.
