# AGENTS.md — how an agent works in this repository

Written 2026-09-07. Everything here was measured, not assumed. Where a number
appears, it came from a live query or a run, and the date is given.

`CLAUDE.md` describes the project. This file describes **working in it**: the
gates you must pass, the traps that have already cost time, and the mission the
work serves.

---

## 1. The mission

**t27 is the central repository. trios is secondary.**

The goal is that files are **generated from `.t27` specifications** rather than
written by hand. When somebody connects their repository, it is scanned for
logic that already exists as a spec; what is missing gets a spec written and
contributed back to the common bank. That is how the same code stops being
written twice in two places, and it is the engine of the language.

The bank, measured 2026-09-07: **760 specs**, 216 982 lines, across five
engines — t27 (575), tri-net (113), trinity-fpga (64), tt-trinity-corona (5),
trinity (3). Health: 522 ok, 235 warn, 3 fail.

The Queen at `t27.ai/#/queen` judges the code and keeps the board. Her live data
is at `trios-agent-server-production.up.railway.app/queen/*`.

---

## 2. Language

**Code is English. Conversation is Russian.**

- Identifiers and comments: English. Enforced by `scripts/no-cyrillic-guard.cjs`
  on every commit. Cyrillic is allowed **inside string literals** (the product
  is bilingual) and on any line carrying the marker `cyrillic-ok`.
- Commit messages: English. Enforced separately on `commit-msg`.
- User-facing text: through the dictionary in `player/src/atoms/language.ts`,
  never baked into markup. The app opens in **English by default** —
  `getInitialLanguage` returns `'en'` unless the browser asks for Russian.
  `t('key', { n: 4 })` substitutes `{n}`.

The repository still contains a great deal of older Russian code. The guard is a
**ratchet**: it inspects only lines a commit adds, so old code is left alone.
Do not mass-rename it — see the trap in §5.

---

## 3. The gates

Every commit runs `lefthook run pre-commit`: secrets, prettier, eslint,
`tsc --noEmit`, `no-cyrillic`, and `check:player-types`.

**They were switched off until 2026-09-07.** `core.hooksPath` pointed at
`.husky`, so lefthook never received the hook, and `.husky/pre-commit` printed
"all checks passed" while `pnpm exec lint-staged` failed on every single commit
with its exit code unchecked. A gate that reports success while doing nothing is
worse than no gate, because people trust it.

The moment it started running it found 39 real type errors from one missing
field and a `ReferenceError` waiting in the SOUL editor.

`check:player-types` is a **ratchet with a baseline** (currently 5). When it
falls, lower the baseline in the same commit — the script says so itself. Never
raise it.

⚠️ **`npx lefthook run pre-commit` by hand discards uncommitted work.** On a
failed check it restores files from the index and unstaged edits are gone. It
silently reverted two files in one session. **Commit first, then run hooks.**

---

## 4. Measure before you build

The habit that has paid off most in this repository.

- The journal was built only after establishing that **no event log exists** —
  of 19 tables in Supabase not one is one, and `ai_requests` / `bot_skills_log`,
  which code writes to, are absent from the database entirely.
- The hive tab calls `t27.ai` and the Queen **directly** because both were
  checked and answer `access-control-allow-origin: *`. No proxy was needed.
- No coverage percentage was invented for the game, because the join was tried
  and **does not work**: a spec's `module` is a spec name, not a repository
  path, and matching by last path segment hits 13 of 115. A wrong number that
  looks authoritative is worse than an absent one.

When you cannot measure something, say so in the code where somebody will look.

---

## 5. Traps that have already cost time

**`\b` is an ASCII word boundary.** In JavaScript (and in perl without
`-CSD` plus `use utf8`) a `\b…\b` pattern around a non-Latin name matches
nothing, and the substitution silently does not happen.

**`=` compares in SQL and assigns in JavaScript.** A generated predicate using
`=` writes instead of comparing and always returns truthy.

**Non-ASCII identifiers break bash.** `local имя` fails in zsh. This has cost
five separate incidents; `bash -n` does not catch it, only running does.

**A word-map rename mangles prose.** Short common words in the map get
substituted _inside_ comments and test names. Map long unique identifiers only,
then grep for mixed-language lines.

**A mutation that does not apply is not a result.** Always assert the mutation
landed (`grep -q` for the new text) before believing "survived". Two false
"survived" reports in one session sent work chasing tests that were fine.

**Shell quoting eats `node -e` scripts.** Single quotes inside a single-quoted
shell string terminate it. Write the script to a file.

---

## 6. Tests

`.claude/skills/blind-guards/SKILL.md` is the long version and should be loaded
before editing any test. The short version:

- A test that cannot fail is not protection, it is a picture of protection.
  Break the real code and check the test goes red.
- A fake database must **parse the query it was given**, not hold its own copy
  of the rule. A fake with its own copy let a real mutation through.
- Assert quantity, not presence. "and N more" was still printed when the
  truncation was removed.
- If code chooses from a set, the test's set must have **more than one**
  element — otherwise `max` and `min` are indistinguishable.
- Test clock and code clock must be on the same scale.
- A flaky neighbour is worse than a failing test: it teaches people to re-run
  until green, and then a real regression gets re-run away too.

---

## 7. Rules that do not bend

- **Never `git push --force`.** Pull requests only.
- **Never put a secret in a tracked file.** A value that lands in one must be
  **rotated**, not deleted. Read secrets from Railway (`railway variables --kv`)
  or Infisical.
- **Clients must not know about other clients.** `users` is ONE table for the
  whole platform — 2380 people across sixteen bot owners — and the separation
  happens at read time. Ask `src/hive/roles.ts`; never re-derive the rule.
- **Fail closed.** If you cannot tell who is asking, show nothing. Not a
  summary: a platform summary also tells them about other people.
- **Silence is not zero.** An unreachable service and a quiet one look identical
  on a dashboard and mean opposite things. Say which.

---

## 8. Where things live

| What                   | Where                                                        |
| ---------------------- | ------------------------------------------------------------ |
| Roles and visibility   | `apps/vibee-editor/render/src/hive/roles.ts`                 |
| Event journal          | `apps/vibee-editor/render/src/hive/journal.ts`               |
| The Queen's report     | `apps/vibee-editor/render/src/hive/queen-report.ts`          |
| The Queen's API client | `apps/vibee-editor/render/src/hive/queen-client.ts`          |
| The game tab           | `apps/vibee-editor/player/src/pages/Hive.tsx`, `lib/hive.ts` |
| Navigation (one list)  | `apps/vibee-editor/player/src/lib/primaryNavigation.ts`      |
| Dictionary             | `apps/vibee-editor/player/src/atoms/language.ts`             |
| Shell for daily work   | `bin/tri` (`tri hive`, `tri space`, `tri guards`)            |

---

## 9. Open epics

- #2131 — Onboarding through GitHub: a fork of t27 and a scan of the repo
- #2132 — The hive journal: the bot's money still does not reach it
- #2133 — Release readiness: what the switched-off gates were hiding
- #2134 — The game tab: remaining views, iOS, and the score
- #2135 — The Queen plans with the owner and work flows through her
