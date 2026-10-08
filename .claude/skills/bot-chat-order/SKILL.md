---
name: 'Bot Chat Order'
description: 'Order in the bot private chat: the tabs (forum topics) named after their agents, one agent memory shared by the bot and the mini-app, a pressed menu that leaves instead of piling up. Use when the conversation "resets and starts over", the bot and the mini-app show different chats, a tab has an old name, the same menu repeats under every message, or anything touches src/navigation/topics/ or the act:* handlers.'
---

# Bot Chat Order

Owner, 2026-10-08, in one evening: "put the chats in the bot in order -- every
agent its own thread", "the agent keeps writing the same menu everywhere",
"the chats must be in sync in the bot and the mini-app, and the session must
keep every exchange -- now it resets and starts over, this is a bug".

## When to Use This Skill

- A person says the agent forgot them, the conversation started over, or the
  mini-app does not show what they wrote in the bot (or the reverse).
- A tab in the private chat has an old or generic name, or a deleted tab.
- The same standard menu (`act:*`) shows up under message after message.
- Any change to `src/navigation/topics/*`, `src/navigation/helpers/pressedMenu.ts`,
  the `act:*` handlers in `registerCommands.ts`, or `recordTurns`/`readConversation`
  in `src/services/trinityAgent.ts`.

## Quick Diagnosis

| Symptom                                           | Cause                                                                               | Where                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| "it starts over" after a message outside the tabs | memory keyed by thread id: a new thread had no past                                 | fixed by `bot-agent-memory.t27` (memory.ts)                      |
| bot and mini-app show different chats             | the turn went to a tab's own conversation, or the mini-app opened `?c=` another one | Agent tab and non-tab threads = base `self`, which `/chat` opens |
| one turn answered with no context                 | history read failed -> `[]`                                                         | `readsAgain`: one more read, then a warn log                     |
| a fallback line in the wrong chat                 | `recordTurns` without `where`                                                       | pass `turnWhere` (room or conversation)                          |
| tab named "Agent 1" / old title                   | made under an older table                                                           | `retitle` renames once in `ensureTabs` (`bot-topic-tabs.t27` v3) |
| menu repeated under every press                   | the pressed message kept its `act:*` keyboard                                       | `leavePressedMenu(ctx)` after `answerCbQuery`                    |

```bash
npx vitest run src/spec/bot-agent-memory.test.ts src/spec/bot-topic-tabs.test.ts \
  src/spec/bot-menu-press.test.ts src/__tests__/navigation/topicTabs.test.ts \
  src/__tests__/bot/oneMemoryAcrossThreads.test.ts
```

## Laws

1. **One memory per person across doors.** All history is the render table
   `agent_messages`, keyed `(telegram_id, thread)` and not by bot. The bot's private
   chat outside a fixed non-Agent tab writes `self`, which the mini-app's `/chat` opens.
   A fixed tab other than the Agent tab writes `self~tab<kind>`, keyed by kind and
   never by thread id. A remade tab, or the same tab in another bot, keeps its memory.
2. **A missing record joins the base.** If a tab lookup fails, the database is
   missing, or the thread is unknown, the turn writes `self`. A new key with an empty
   history is exactly the reset the owner reported.
3. **Every agent door asks `agentConversationIn(ctx)`.** That covers a typed turn,
   a press (`runAgentTurnFor`), and both `recordTurns` fallbacks
   (`turnWhere`). `oneMemoryAcrossThreads.test.ts` pins all of them.
4. **The answer to a press never waits for the old menu to go**
   (`ANSWER_WAITS_FOR_EDIT = false`). A refused edit costs nothing.
5. `src/navigation/topics/engine.ts` must stay byte-identical to the render's
   `topic-tabs-engine.ts`. The parity test fails otherwise.

## Common Issues

- The fake database in `topicTabs.test.ts` matches SQL by shape. A new
  `UPDATE ... SET title = $4` needed its own branch; the generic one wrote the
  title into `thread_id`.
- Old `self~topic<id>` conversations from before 2026-10-08 are not migrated.
  They still show in the mini-app's conversation rail and are no longer continued.
- The bot reads 40 turns of history, while the mini-app keeps up to 100 locally.
  That difference in context depth is deliberate: models with a 16k window.

## Пишем на .t27

**Владелец, 07.10.2026: «все пишем на .t27».** Число, порог, правило, цена,
лимит, порядок на экране -- всё, что в этой теме решает поведение, пишется
спекой `.t27` ПЕРВОЙ (в `gHashTag/t27`); хост импортирует числа из вывода
`t27c gen-ts`, а тест гоняет каждый `test` спеки против кода. Код без спеки --
долг, а не норма. Как именно, законы и ловушки -- только в навыке
`t27-spec-first`: здесь указатель, не копия правила.

Specs of this theme: `bot-topic-tabs.t27`, `bot-menu-press.t27`,
`bot-agent-memory.t27` (gHashTag/t27#7824).

## Related Resources

- `src/navigation/topics/{memory,threads,tabs,engine,wire}.ts`
- `src/navigation/helpers/pressedMenu.ts`, `src/services/trinityAgent.ts`
- render: `apps/vibee-editor/render/src/agent/{conversation,routes}.ts`
- player: `apps/vibee-editor/player/src/pages/Chat.tsx`, `lib/agentHistory.ts`
- Skills: `buttons-by-substance`, `t27-spec-first`, `admin-chat`
