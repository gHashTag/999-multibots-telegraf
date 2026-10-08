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

## Streamed answer and events in their tab (2026-10-08)

- **Draft with a stop button** (`bot-agent-stream.t27`, `navigation/helpers/answerDraft.ts`). In a private chat, the agent lane calls `startAnswerDraft`. The person first sees "Thinking…" with a stop button. After that the draft shows the answer as it streams. It is updated at most once a second, refreshed every 20 s while a tool is running, and cut to 4096 characters. The finished answer always goes out as a real message.
  - **Stop.** A stop press arrives as the update `stopped_message_generation`, which is in `allowed_updates` in `src/index.ts`. `draftStopMiddleware` handles it and the turn is aborted. The person gets the text written so far, or the line "Остановлено." if nothing was written yet.
  - **Old server.** The first refused draft turns drafts off for that bot until the next restart. This covers the farm's own Bot API server, whose version we cannot see.
- **Events in their tab** (`bot-event-tabs.t27`). Each event is routed to the tab of its agent:

  | Event                                         | Tab       | Where it is wired                                |
  | --------------------------------------------- | --------- | ------------------------------------------------ |
  | payment (`successful_payment`)                | Treasurer | `inEventTab('payment', …)`                       |
  | `browser_ask_input`, `browser_ask_permission` | Navigator | render `sendToTelegram(…, { event: 'browser' })` |
  | story reel news                               | Director  | `notifyInBot(…, 'reel')`                         |

  The render reads `bot_topic_tabs` from the same Postgres and compares the bot name without case. No tab, or a thread the sender named, and the message goes where it went before. Not routed yet: the KIE webhook video deliveries and lipsync results. They are sent by Telegraf instances with no ctx; to route them, call `eventThread` from them.

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
