---
name: 'kanban-card-chat'
description: 'Tap any card on the game kanban (app.t27.ai/game/kanban) and a chat with the agent opens with the task history, so the person can write and continue the task; the same thread is shared with every A2A agent. Use when touching the kanban card click, the task thread (task:<owner>/<repo>#<n>), the card-chat sheet in the Hive, A2A contextId for a task, or `tri card`.'
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
- jsdom frames in `Hive.test.tsx` have a stub `contentDocument` without
  `addEventListener`; `catchCardTaps` checks the function before listening.

## Speed: `tri card`

```bash
tri card 5382                    # the card, its column, the last 12 turns
tri card t27#5382 "what's left?" # say it; the agent's answer streams back
```

Same thread as the sheet and A2A; turns are marked surface `agent`, so the
sheet shows them as "via another agent".

## Related Resources

- `STATE.md` -- the loop ledger.
- `docs/research/kanban-card-chat-competitors.md` -- how Linear, Copilot,
  Codex, Devin, Cursor, Jules do it.
- Skill `t27-spec-first` -- binding the spec.
- Skill `links-open-in-telegram` -- deep links to a card.
