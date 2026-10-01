# kanban-card-chat loop ledger

Branch: `claude/kanban-chat-agent-history-4353da` (999-multibots-telegraf).
Started 2026-10-01. One line per step; tick only after the commit exists.

## Steps

- [x] S0 Audit weak spots (listed below)
- [x] S1 Skill + this ledger
- [x] S2 Competitor research -> docs/research/kanban-card-chat-competitors.md
- [x] S3 `.t27` spec in gHashTag/t27 -- PR https://github.com/gHashTag/t27/pull/5389 (10/10, negative control fails 1)
- [x] S4 Bind spec in render (src/spec/kanban-card-chat.\*, scripts/t27-specs.json) + byte copy player/src/spec (held by cardChat.test.ts)
- [x] S5 Render: task thread in threadFor + history + chat, task context injection
- [x] S6 Render: A2A message/send persists into the task thread (metadata.task / contextId)
- [x] S7 Player: CardChatSheet + Hive listener + anchor fallback + /game/kanban?card=N
- [x] S8 Trinity: card tap posts open-card -- gHashTag/trinity feat/kanban-card-opens-chat 91e365910, `npm run test:card-chat` 4/4 (QUEEN_REF bump = owner)
- [x] S9 `tri card <n> [text]` (refuses a non-task thread, exit 2)
- [x] S10 EPIC https://github.com/gHashTag/t27/issues/5388 (epic, priority/critical) -- in gHashTag/t27, not trios + children, priority for the queen
- [x] S11 Gates green (pre-push 12/12), PR https://github.com/gHashTag/999-multibots-telegraf/pull/3208 (no merge)
- [x] S12 Report + three options for the next loop (chat, 2026-10-01)

## Weak spots (S0)

1. Card tap opens GitHub in a new tab; nothing about the agent.
2. Cards carry no agent, no conversation, no history.
3. A2A tasks live in memory (500 cap), lost on every deploy, cannot be
   appended to, and start every message with an empty history.
4. QueenChat turns live in useState: a reload forgets them; `sayToAgent`
   sends no conversation, so every board chat lands in the person's `self`.
5. No thread is keyed by a task.
6. The agent is not told which task the person is talking about.
7. `answerIdentityRequests` accepts only origin https://t27.ai, but the frame
   is same-origin now. Checked 2026-10-01: not a defect -- on app.t27.ai the
   board reads the app session directly (trinity `appSessionIdentity.ts`).

## Anomalies

(append: date, what, evidence, fix)

- 2026-10-01 The board's repository is gHashTag/t27 now, not trios
  (`/queen/public-board` .repo, 866 cards). Fix: no repository is written in
  the spec; a bare number belongs to the board's own repo (REPO_FROM_BOARD).
- 2026-10-01 245 of 866 cards carry no title -- the title is literally
  "#5382". Fix: the note says "untitled" (UNTITLED_SAYS_SO).
- 2026-10-01 /Users/playra/t27 checkout is on an old branch and its t27c has
  no `gen-ts`; t27's default branch is `master`, not `main`. Fix: worktree
  /Users/playra/t27-kanban-card-chat off origin/master, t27c built there.

## PRs

(append: repo#n, what, state)

- gHashTag/t27#5389 -- the spec, open.
- gHashTag/t27#5388 -- the EPIC, S0-S9 and S11 ticked.
- gHashTag/trinity#1203 -- the board posts open-card, open; QUEEN_REF bump = owner.
- gHashTag/999-multibots-telegraf#3208 -- render + player + tri, open. Red CI
  checks (Secrets Detection on old test fixtures, Dependency Audit
  brace-expansion, Validate PR Rules, claude-review) are red on #3207 and on
  main too -- the repository's baseline, not this PR. Local pre-push: 12/12.

## Next loop: what to verify first

1. After the owner merges #3208 and render deploys: `tri card <n>` must print a
   `task:` thread, not exit 2 (exit 2 = the live render still answers `self`).
2. After the QUEEN_REF bump: on a phone, a tap on a card at /game/kanban opens
   the sheet with no GitHub tab (open-card path, not the anchor catch).
