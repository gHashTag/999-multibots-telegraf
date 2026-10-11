---
name: tri
description: 'Runs any multi-part task as one brain: the session is the general that splits the task into independent orders, hands them out in parallel (Queen bees for gHashTag/t27, worktree subagents for every other repo), then accepts the results by running them and through the rainbow bridge, where two live people check a feature from both sides with agents between them. Use at the start of ANY task with several parts, before opening the editor yourself, and before saying a feature "works". Triggers: "/tri", "you are the general", "delegate", "parallelize", "through the bees", "rainbow bridge", "check from both sides", "who asks, who does, who checks"; in Russian: «ты генерал», «делегируй», «распараллель», «через пчёл», «через акторов», «ставь приказы», «сам не делай», «радужный мост», «проверь с двух сторон», «прогони функции через юзер-ботов».'
argument-hint: '[task, epic or feature]'
---

# /tri -- one brain: orders out, results in, the bridge accepts

Owner, 2026-10-11: name this skill `/tri`; "it all works together as one
brain". Owner, 2026-09-20: tri means two live people at the ends and agents
between them helping -- not agents instead of people.

One loop, three stages:

1. **Orders go out** -- the session (the general) splits the task and hands
   out orders in parallel.
2. **Executors deliver** -- bees and subagents push PRs.
3. **Acceptance** -- the general runs each order's criteria; for anything a
   person touches, the rainbow bridge accepts it from both sides.

Deeper trap list for the bridge: skill `rainbow-bridge`. Bee details: skill
`bee-delegation`.

## Stage 1. The general gives orders

Owner, 2026-10-11: "delegate and parallelize through actors at once, do not
do it yourself, you are the general and you give orders."

The session is headquarters: understand the goal, split it into independent
orders, hand them out, watch, accept. Writing code that an executor could
write breaks the principle; it is not diligence.

### Executors, in order of choice

| Executor                                         | Works in            | Strength                                                                                                 | Limit                                                                                      |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Queen's bees**                                 | `gHashTag/t27` only | cheapest; live on the server and **survive the end of the session**; actor model (supervisors, restarts) | no other repo; the order waits for its queue slot and free files                           |
| **Subagents** (`Agent`, `isolation: "worktree"`) | any repo            | parallel, start at once                                                                                  | live inside the session and die with it; cost more                                         |
| **The general itself**                           | --                  | --                                                                                                       | only what cannot be delegated: deciding, accepting, reporting, merging on the owner's word |

Everything doable in `gHashTag/t27` (specs, t27b, t27c, reports) goes to
**bees**. Wiring specs into hosts in other repos, changes to
999-multibots-telegraf and TurboBaby go to **subagents**.

### Writing an order

An order is everything the executor knows. It has not seen this conversation.

**For a bee** -- an issue in `gHashTag/t27` with all four sections at once
(the Queen skips an issue missing any of them):

```
## User Scenarios & Testing
- **Given** ..., **When** ..., **Then** ...
## Requirements
- FR-001: ... MUST ...
## Success Criteria
1. `cargo test -p t27b` exits 0          (measurable: command and exit code)
## Boundary
- concrete/file/path.rs                  (files, not directories)
```

Full rules and skip reasons: `bee-delegation`.

**For a subagent** -- a prompt with:

1. the goal in one sentence and why it matters;
2. repo, base branch, where to work;
3. **boundary**: which files may be touched;
4. "done" criteria as commands with expected output, plus a negative control;
5. prohibitions: **no merge to `main`, no deploy**, no prod, never print
   secrets, code and comments in English, logic as a `.t27` spec;
6. persistence: push after every green step, open the PR as soon as there is
   something to show, keep the order under ~30 minutes (sessions die --
   memory `sessions-die-persist-as-you-go`);
7. what to return: the PR link and one table "check | command | result".

### Parallel without collisions

- Orders are **independent**: different files, different branches. Two
  orders on one file are one order.
- Bees: the boundary must not overlap files already held (`/queen/status`,
  `skipSummary.claimed` and `fileConflict`).
- Subagents: each gets its own worktree (`isolation: "worktree"`); launch
  them all **in one message**, in the background.
- An order that depends on another (a report cron waits for its spec) is
  issued when the dependency is delivered, not before.

### What the general does itself

- decides and splits;
- writes orders;
- watches the board and the background tasks;
- accepts work by running it;
- reports to the owner: what was issued, who took it, what was delivered,
  what blocks;
- what cannot be delegated: merge and deploy **only on the owner's word**;
  messages to a client only by the owner (skill `vip-client-care`).

## Stage 2. Acceptance by running

Work is accepted by **running** it, not by reading the executor's report: run
its criteria yourself, look at CI. A "done" without a command and a result is
not acceptance. A bee delivered -- check its PR in t27; a subagent delivered
-- check its branch.

Checklist per order:

```
- [ ] criteria commands run by the general, output matches
- [ ] negative control fails when it should
- [ ] CI status read from the source (`gh pr view`, `gh run list`), "queued" is not "green"
- [ ] if a person will touch it: the rainbow bridge (Stage 3)
```

## Stage 3. The rainbow bridge: human <-> human, agents between

"Works" means a live person on a phone got the right answer, not that a test
is green. Proof is a check-mark row in `tri commands` or a quote from
`tg_history`, not `vitest` output.

### Three roles

Owner, 2026-09-21: one makes a request for a function, the second provides
it, the third watches the integrity of the answer and corrects it when there
is a problem.

| Role       | Who                                      | What it does                                                                |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| **Asks**   | party A's account (userbot, `crm_duet`)  | sends a command / question / file to a farm bot                             |
| **Does**   | the farm bot and the render agent        | answers as it would answer a live person                                    |
| **Checks** | an agent reading the chat (`tg_history`) | compares the answer with the question; on failure -- to the hive, and fixes |

### Run order

```bash
tri bridge <owner_id> <second_party_id>   # 1. machine: bots, both parties' profiles, the agent on two surfaces
tri commands                              # 2. which menu commands NOBODY has pressed yet
```

1. **`tri bridge`** -- one minute, parallel, writes to no one. Read only the
   yellow and red rows. The "profiles" section says whether a party is ready
   for **real work**: is it a seller (Telegram connected), is the live wallet
   readable, does the render know it. Every gap names whose press closes it.
   The sign-in code is typed by the person; granting tokens is the owner's
   decision.
2. **`tri commands`** -- from the owner's chat with each bot: check = answered,
   cross = silent, dot = not tried. Dot rows are the press list for people.
3. **People** do only what the machine cannot: a real voice note both ways,
   a real `.md` and `.pdf`, payment through their own cashier, the mini app
   from their own account.
4. **Checks**: after the presses -- `tri commands` again; red goes to the hive
   (`bot-errors`, `client-unanswered` are filed automatically).

### Bots on our own Bot API server

**Run `tri` only from a copy of current `main`.** The host is chosen by token
(`scripts/lib/telegram-api.cjs`) only in fresh code. Measured 2026-09-22:
`tri bridge` from a stale checkout asked `api.telegram.org` about a bot that
had just moved, and the cloud took the bot back three minutes after
`logOut` (there is no "10 minutes"). Before `tri`: `git fetch && git merge
--ff-only origin/main` if the copy is on `main` and clean.

`tri botapi` -- which bots are on our server and whether the three lists
(bot, render, server allowlist) agree, with the next step for each mismatch.
`tri bridge`, `tri pack`, `tri commands` refuse to run from a copy behind
`main` in the host-selection files (exit 3).

From a laptop such a bot shows as `· id … on our Bot API server; not
reachable from here` -- not a failure: the server listens only on the Railway
private network. Its health is the `[bot-api]` lines in the bot log. Which
bots moved and how to roll back: `deployment/telegram-bot-api/README.md`,
step 4b.

### Live dialogue of two parties: `crm_duet`

What the owner wants to **see in the DMs** -- userbots talking -- already
exists: the `crm_duet` tool (render, `crm-duet-tool.ts`, spec
`t27 specs/automation/crm-duet.t27`). The owner's seller writes from the
owner's session, a persona model answers from the second party's session,
and material is made for that party's real product. The judge is
`crm_duet_status`: transcript, every tool called (ok / fail), number of paid
generations.

```bash
# via MCP as the owner (script hive.cjs from skill mcp-owner-access)
crm_duet        {"buyer":"<id>","turns":2}                   # no dry_run = trial: nothing is sent
crm_duet_status {}                                           # transcript and tools
crm_duet        {"buyer":"<id>","turns":4,"dry_run":false}   # real: visible in both DMs
```

**A real run only with an explicit `"dry_run":false`.** Without `dry_run` (or
with any other value) the tool does a trial run and says how to run it for
real, so a forgotten "yes" from the owner sends nothing.

**When it is allowed.** Both parties connected their own accounts in the app
(`tg_sessions`), and the owner **allowed this run in chat** -- each run, not
"in general". Paid generations come from the seller's balance. Trial run
first: the code changes daily, and a crooked message from a live account
cannot be taken back.

**The persona is not a person.** Its answers are the model's guesses. They
are not written as facts into the client profile (`crm_client_profile`,
status "draft"): the person answers the onboarding questions.

### What /tri does NOT do

- **Does not write in someone else's name without both conditions** -- the
  account was connected by that person and the owner allowed this exact run.
  Otherwise only a live person's press.
- **Does not send from the owner's account without permission.** Outside the
  duet every send from it is a card with a "Send" button.

## Report to the owner (format)

```
Issued: N orders (bees K, subagents M)
| order | executor | status (claimed / in progress / PR / delivered / blocker) |
Accepted (by running): ...
Bridge: tri commands -- answered X, silent Y, untried Z
Blockers: ...
Waiting for your word: ...
```

End with three options (skill `three-options-at-the-end`).

## Пишем на .t27

Owner, 07.10.2026: "we write everything in .t27". Any number, threshold,
rule, price, limit or on-screen order that decides behaviour here is written
as a `.t27` spec FIRST (in `gHashTag/t27`); the host imports the numbers from
`t27c gen-ts` output, and a test runs every spec `test` against the code.
Code without a spec is debt, not the norm. How, the laws and the traps live
only in the skill `t27-spec-first`: this is a pointer, not a copy.

## Related resources

- `bee-delegation` -- issuing orders to bees and reading the board
- `rainbow-bridge` -- the full trap list for two-sided checks
- `vip-client-care` -- client work, reports, prohibitions
- `mcp-owner-access` -- acting as the owner without their credentials
- `three-options-at-the-end` -- how to end the report
- Memory `sessions-die-persist-as-you-go` -- why push after every step
