# kanban-card-chat loop ledger

Branch: `claude/kanban-chat-agent-history-4353da` (999-multibots-telegraf).
Started 2026-10-01. One line per step; tick only after the commit exists.

## Steps

- [x] S0 Audit weak spots (listed below)
- [x] S1 Skill + this ledger
- [ ] S2 Competitor research -> docs/research/kanban-card-chat-competitors.md
- [ ] S3 `.t27` spec in gHashTag/t27 (worktree /Users/playra/t27-kanban-card-chat), PR
- [ ] S4 Bind spec in render (src/spec/kanban-card-chat.*, scripts/t27-specs.json)
- [ ] S5 Render: task thread in threadFor + history + chat, task context injection
- [ ] S6 Render: A2A message/send persists into the task thread (metadata.task / contextId)
- [ ] S7 Player: CardChatSheet + Hive listener + anchor fallback + /game/kanban?card=N
- [ ] S8 Trinity: card tap posts open-card (worktree, PR; QUEEN_REF bump = owner)
- [ ] S9 `tri card <n> [text]`
- [ ] S10 EPIC in gHashTag/trios + children, priority for the queen
- [ ] S11 Gates green, PR opened (no merge)
- [ ] S12 Report + three options for the next loop

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
   is same-origin now (to verify).

## Anomalies

(append: date, what, evidence, fix)

## PRs

(append: repo#n, what, state)
