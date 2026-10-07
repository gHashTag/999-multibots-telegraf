---
name: agent-hive
description: 'The agent hive in Telegram: @t27ai_bot is the manager ("mother") of one managed bot per catalogue agent, each with its own forum topic in a shared hive group. Use when creating, pausing or re-tokening agent bots (/agents), setting up the hive group (/hive), debugging why an agent bot is silent in a group, or changing the bot-to-bot chain limits.'
---

# Agent hive

## When to Use This Skill

- "create the bot for agent X", "/agents shows nothing", "the token button".
- "/hive says not a forum / no rights", "an agent does not answer in the group".
- "two agents loop", "an agent answers a bot from outside", "@all floods the topic".
- Any change to `src/core/bot/agentHive/` or the spec `agent-hive-group.t27`.

## Map

```
src/core/bot/agentHive/index.ts     /agents (private, team only), /hive (group), buttons hive:<verb>:<arg>
src/core/bot/agentHive/answer.ts    answerAsAgent: who answers, chunking, relay to the render agent
src/core/bot/agentHive/rules.ts     addressed / chainOpen / cooled / callsAll / mentions (numbers from the spec)
src/core/bot/agentHive/chain.ts     in-memory depth + origin per message, 5000 kept, cooldown per bot
src/core/bot/agentHive/claims.ts    "the next bot this owner creates is agent X", fallback by t27_<id>_bot name
src/core/bot/managedBots/*          Bot API 9.6 managed bots: store (managed_bots table), runner, protocol
src/spec/agent-hive-group.t27 (+ .gen.ts, .test.ts, .mutants.json)   MAX_BOT_DEPTH 3, cooldown 5 s, @all
src/__tests__/core/agentHive/*      spec vectors, install, edges, relay -- lines 100% since #3645
```

## Laws (do not break)

1. **A bot turn runs in the PERSON's name** (`origin` in chain.ts), never the bot owner's. A bot
   message whose origin is unknown is not answered. Otherwise "@A ask @B to do X" spends the
   owner's wallet.
2. **Bots outside the hive are never answered** (`isHiveBot`), and no bot is answered in private.
3. **Depth ≤ 3, 5 s cooldown per bot** -- numbers live in the spec, not in TS.
4. Callback handlers call `answerCbQuery()` first; every button is admin-only (`isAdmin`) and acts
   only on bots in this manager's agent list.
5. A second tap on Create must not request a second bot (#3645). Two taps BEFORE confirming still
   show two request keyboards; Telegram creates only what the person confirms.

## Owner steps the API cannot do

- `getMe.can_manage_bots` of @t27ai_bot must be true (Bot Management in @BotFather Mini App).
  On 2026-10-05 it was false on all farm bots -- memory `managed-bots-mode-off`.
- One confirmation tap per created bot.
- **Bot-to-Bot Communication Mode** in @BotFather for every agent bot, or agents never see each other.
- Hive group: a forum, @t27ai_bot admin with "manage topics", then `/hive` there; agent bots are
  added by the person through the links /hive prints (admin rights, so they read every message).

## Quick Diagnosis

| Symptom                       | Cause                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/agents` silent              | sender not admin, or the manager is inert (no can_manage_bots)                                                      |
| agent silent in group         | not tagged / not its topic / Bot-to-Bot Mode off / chain depth 3 / cooldown                                         |
| agent silent to another agent | that bot is not registered in this process (isHiveBot), or origin unknown after a redeploy (chain map is in memory) |
| `/hive` "not a forum"         | Topics off; a basic group has negative id without -100                                                              |
| topic messages fail           | a person deleted the topic; `hive_topic_id` is stale (#3652)                                                        |

## Testing recipe

- `npx vitest run src/__tests__/core/agentHive --coverage --coverage.include='src/core/bot/agentHive/**'`
- Mutant: commit first, break one guard by `sed`, see the named test go red, `git checkout --` the file.
- A worktree push whose related-tests run locally: memory `worktree-gates-need-linked-deps`
  (atoms-resolve trap). The cure is one command: `tri wt-deps <tree>` (#3675).

## The "only t27" rule (owner, 2026-10-05)

No new PR may add or modify hand-written non-t27 code. Hive improvements go into
`agent-hive-group.t27` first; TS work waits for the owner's `owner-approved-foreign` label.
The open queue (epic #3641, issues #3646-#3654) is parked on that decision. Ledger of the
improvement loop: `~/.local/state/agent-hive/ledger.md`.

### Laws already in the spec, waiting for the host

The 999 copy in `src/spec/` is still v1. In gHashTag/t27 the spec is v3, and each version
only adds laws:

| Issue                     | Spec law (t27)                                          | Version       |
| ------------------------- | ------------------------------------------------------- | ------------- |
| #3646 typing refresh      | `typing_due`, `TYPING_REFRESH_MS` 4 s                   | v2 (t27#6558) |
| #3649 one speaker on @all | `speaks_on_all`, `ALL_FIRST_SPEAKERS` 1                 | v2            |
| #3651 follow-ups          | `follows_up`, `FOLLOW_UP_WINDOW_MS` 2 min               | v2            |
| #3648 /stop, /mute        | `may_answer_after_stop` 10 min, `heard_while_muted` 1 h | v2            |
| #3647 reactions           | `turn_ok`, `keeps_seen_mark`                            | v3 (t27#6564) |
| #3650 /brief              | `brief_source`, `brief_fits` 1000, `may_set_brief`      | v3            |
| #3652 deleted topic       | `recreate_topic`, 10 min cooldown                       | v3            |
| #3653 /summary            | `summary_count` 50 by default, log 200                  | v3            |

When the label arrives, vendor the v3 `.t27` into `src/spec/`, regenerate `.gen.ts` with
`t27c gen-ts`, and mirror every new `test` block in `agent-hive-group.test.ts`. Expect
`check-t27-specs` to demand that. gen-ts emits constants only, not fn bodies (t27#6559), so
each law is written once in TS and pinned by the spec vectors.

### Spec work in a t27 worktree

- Build both binaries: `cargo build --release -p tri -p t27c`.
- Commit with `git -c core.hooksPath=.githooks`. That path is the only one that runs a gate;
  see memory `t27-worktree-commit-runs-no-gate`.
- `t27c test-report <spec>` gives the truth; `t27c check` only typechecks.
- Run one sed mutant per law, addressed by line number. The reviewer bee found two survivors
  in t27#6564 that the author had missed, and its review is worth waiting for.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.

## Related Resources

- Epic #3641; PRs #3636 (hive), #3645 (double tap, token, coverage); t27 #6430 (spec).
- Skills `t27-spec-first`, `telegram-bot-expert`; memory `managed-bots-mode-off`.
