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

### Loop 2 (owner: "все три")

- [x] L2.1 Phone: `tri shot card-chat` / `card-chat-empty` (390/320, ru/en), four layout defects fixed + jsdom guards -- ac686c5bc on #3208
- [x] L2.3 Red CI baseline -- PR https://github.com/gHashTag/999-multibots-telegraf/pull/3214 (secrets markers, brace-expansion/grpc in bun.lock, PR rules vs claude/ branches); claude-review needs the owner's new OAuth token
- [x] L2.2 The card's status, PR and checks in the sheet; move / open-PR only on the person's tap -- spec v2 (t27 b8daa6b06 on t27#5389), `cardStatus.ts`, WorkStrip, agent cards in the sheet, `KANBAN_LIMITS` in the prompt; no move button (the column is the Queen's verdict, render has no GitHub token)
- [x] L2.4 v2 checked against live GitHub, two defects found and fixed in spec v3 (t27 455740292 on t27#5389): the timeline is read at both ends (page 1 + last page, `Link` rel="last"), the middle is said as "at least N more"; checks by `commits/refs/pull/<n>/head/check-runs` -- one read, no `pulls/<n>` (CHECKS_ONE_READ); one open costs <= 4 of the 60 public reads/hour (READS_PER_OPEN_MAX)

### Loop 3 (owner: "все три" again -- live check, server reads, S15)

- [x] L3.1 `tri card-check [n]` -- GETs only, three verdicts (task thread, /api/card-status, the PRs merged); exit 0 live / 2 waiting / 1 wrong. Run 2026-10-01: all `wait` (nothing merged, render still answers `self`, the door 404)
- [x] L3.2 Spec v4 (t27 ea1fac67b on t27#5389, 19/19): STATUS_DOOR `/api/card-status`; render `src/agent/card-status.ts` -- one GraphQL query (never a mutation) for the newest 100 references with check rollups, a cache shared by everyone (1000 cards), concurrent opens coalesced; a person required (resolveIdentity before the door). INERT until the owner sets `GITHUB_READ_TOKEN` on vibee-render: 503 `{configured:false}`, and the client reads as in v3. Player: door first, any unmeasured / broken answer falls back. Parity test: server order == client `linkedPrs` order
- [x] L3.3 S15 move: the Queen has NO door to move one card (read on BrowserOS trios/agent-server #517: the column is computed from registry -> dispatch verdict -> open issue; `PUT /queen/registry` replaces the whole array; `/queen/move` 404). Spec v4 holds the contract for a one-card door (MOVE_SAYS_FROM, target only backlog/dropped, answer with a reason); player `lib/cardMove.ts`; the sheet shows nothing (MOVE_OFFERED = moveOffered(false, ...))
- [x] L3.4 Merged origin/main (#3223 Tasks tab) by hand: the sync tool timed out on `git ls-remote` twice

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

- 2026-10-01 related-tests went red on push: `no-foreign-test-copies` found
  a "nested checkout" `Users/playra/999-multibots-telegraf` INSIDE the
  worktree -- the PNG dir of shot.mjs's first run (`join(ROOT, <absolute
git-dir>)`). Fix: `resolve`, and the stray dir removed. A tool that writes
  under ROOT with an absolute path plants a fake repo for the next gate.

- 2026-10-01 The board's repository is gHashTag/t27 now, not trios
  (`/queen/public-board` .repo, 866 cards). Fix: no repository is written in
  the spec; a bare number belongs to the board's own repo (REPO_FROM_BOARD).
- 2026-10-01 245 of 866 cards carry no title -- the title is literally
  "#5382". Fix: the note says "untitled" (UNTITLED_SAYS_SO).
- 2026-10-01 /Users/playra/t27 checkout is on an old branch and its t27c has
  no `gen-ts`; t27's default branch is `master`, not `main`. Fix: worktree
  /Users/playra/t27-kanban-card-chat off origin/master, t27c built there.

- 2026-10-01 `tri shot card-chat 320 ru` dropped `320 ru` without a word
  and shot 390 -- the "320px green" of L2.1 was a 390px run. Fix: positional
  width/lang are read, anything else unread is a usage error (exit 2).
- 2026-10-01 The shot's GitHub stub sent `x-ratelimit-reset` without
  `access-control-expose-headers`; the browser hid it and the sheet said
  "not measured" with no time, while real GitHub exposes it (curl). The stub
  now answers as GitHub does, and the shot waits for `[data-retry-at]`.
- 2026-10-01 v2 on the phone: the PR strip scrolled sideways past the sheet
  (cut 445>366) and the shared agent-card buttons were 40px. Fix: the strip
  wraps, the repo#n ellipsizes, card buttons get 44px in the card sheet only
  (the main chat's 40px is the same defect, left for its own change).

- 2026-10-01 Live check of v2 on gHashTag/999-multibots-telegraf#999: 149
  timeline events, 58 linked PRs. v2 read one page of 100 (oldest first), so
  the strip showed the OLDEST PRs and said "+42 more" where 55 were hidden --
  the newest work, the one the person asks about, was never in view. And one
  open cost 1 + 2x2 = 5 reads (pulls/<n> for the sha, then check-runs): 12
  opens an hour emptied the public allowance. Fix: spec v3 -- first and last
  page at per_page=100, "at least" for the unread middle, a partial read
  never says "no PR", checks by the PR's head ref in one read; <= 4 reads.
- **2026-10-01, the merge tool timed out.** `sync_with_base_branch` failed
  twice on `git ls-remote`; a hand `git merge origin/main` worked. Conflict
  with #3223 in `language.ts` (`nav.hive` became "Game", `nav.tasks` added)
  and `chat.ts` dmContext (main added `defects`): both kept.
- **iOS Tasks tab (#3223) has a NATIVE fallback kanban** when the web host
  fails; a tap there does not open the card chat. Not ours to change in this
  PR -- noted for the iOS owner.
- **The live render answers `?task=` with `self`** (2026-10-01, card-check):
  the deploy is the owner's merge, not a defect.

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
3. On a live card with a PR: the strip shows the PR chip and a checks dot;
   past 60 reads/hour it must say "limit, again after HH:MM", never "no PR".
4. `tri card-check` -- one command for 1-3 below; `wait` lines name what is
   missing (merge, deploy, token).
5. On an issue with > 200 timeline events (#999 of this repo has 149; find a
   bigger one): the chip says "at least N more", and the newest PR is first.
6. After the owner sets `GITHUB_READ_TOKEN` (read-only, public repos): `tri
card-check` line 2 says `ok server read`, and opening a card in the app
   makes no request to api.github.com (network panel).
