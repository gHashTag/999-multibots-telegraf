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

### The v2/v3 laws, wired (2026-10-08)

All of them run now. The rules are in `rules.ts`, the state between turns in
`room.ts`, the turn in `answer.ts`, and the commands in `installRoomCommands` (`index.ts`):

| Law (spec)                                  | Where it bites                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `typing_due` `TYPING_REFRESH_MS`            | `keepTyping(..., SPEC.TYPING_REFRESH_MS)` in the turn                                                       |
| `speaks_on_all`                             | `allRank`: topic owner, then a named agent, then catalogue order. Only rank 0 answers a bare @all           |
| `follows_up`                                | `noteAnswered` / `sinceMyAnswer`: same person, same topic, 2 min, no tag                                    |
| `may_answer_after_stop`                     | `/stop` (manager) to `noteStop`; cuts bot-to-bot only                                                       |
| `heard_while_muted`                         | `/mute [@bot]` in a topic to `noteMute`; the agent needs its tag for an hour                                |
| `keeps_seen_mark`                           | 👀 on the message while the agent works (✅ is not a Bot API reaction); removed if the turn fails           |
| `brief_source` `brief_fits` `may_set_brief` | `/brief text` (group admins), `/brief -` clears, a bare `/brief` shows; table `agent_hive_briefs`           |
| `recreate_topic`                            | a send into the agent's own topic fails with "thread not found": `createForumTopic`, `setHiveTopic`, resend |
| `summary_count`                             | `/summary [n]`: the topic log (200 lines, in memory) is summed up in the asker's name                       |

Agent bots never answer a `/command` in a group: the manager does, once. Replies meant
for one person (a refusal, the brief in force, "nothing to sum up") are ephemeral
(`replyToOne`, spec `bot-agent-stream.t27`), with an ordinary reply as fallback.
A redeploy forgets stops, mutes, follow-ups and the summary log. Each of them lasts
minutes, and losing one falls back to the v1 rules. Briefs live in Postgres.
Tests: `src/__tests__/core/agentHive/roomLaws.test.ts` (12 host mutants, all killed).

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
