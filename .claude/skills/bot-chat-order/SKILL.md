---
name: 'Bot Chat Order'
description: 'Order in the bot private chat: a TEAM of agents (one tab per member, the Agent at /start, the rest hired by a press or /team), each with its trade and every tool and the t27 spec bank, the tabs (forum topics) named after their agents, one agent memory shared by the bot and the mini-app, a pressed menu that leaves instead of piling up. Use when the conversation "resets and starts over", the bot and the mini-app show different chats, a tab has an old name, the same menu repeats under every message, or anything touches src/navigation/topics/ or the act:* handlers.'
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

  The render reads `bot_topic_tabs` from the same Postgres and compares the bot name without case. No tab, or a thread the sender named, and the message goes where it went before. The KIE webhook videos (`sendVideoDirectly`, Sora, `notifyJobCompletion`) and the lipsync result take `botInTab(bot, chatId, 'reel')` -- in the webhook AFTER `claimVideoJobDelivery`, because the claim must come before any await (`reelDeliveriesLandInTheDirectorTab.test.ts`).

## The team of agents, every tool, every spec (2026-10-08)

Owner: "as soon as a person enters the bot, chats with agents are made for his
interests; each agent its own chat named after its profession -- a team of
agents, not folders" (after OpenAI's dots), and the same hour: "give the agents
access to every spec and every tool". Specs: `bot-agent-team.t27`,
`agent-spec-bank.t27` (t27#7855).

| What                                                                                                                                            | Where                                                                            | Law                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| First /start makes the Agent alone, plus the member the link named (`?start=app_story` brings the Director)                                     | `topics/team.ts` `startingKinds`, engine option `only`                           | `joins_at_start`, `tended`             |
| The Agent tab's first card and `/team` offer the rest, 2 a row; `team:<kind>` makes that one tab                                                | `topics/wire.ts` `teamRows`, `registerTabsCommand`                               | `offered`, `HIRE_BUTTONS_PER_ROW`      |
| /tabs looks after the stored tabs and makes nobody new                                                                                          | `ensureTabsQuietly` default `only`                                               | `tended`                               |
| A fixed tab's turn is that member's: its trade and lead tools in the prompt                                                                     | render `agent/profession.ts`, `routes.ts` passes `profession: gate.conversation` | `has_trade`, `leads_with`              |
| Every member is shown EVERY tool; a trade is a lead, never a fence                                                                              | `shownTools`                                                                     | `EVERY_TOOL_FOR_EVERY_MEMBER`          |
| Every agent searches and reads `specs/` of gHashTag/t27 (free, listing kept 10 min, read cut at 16000, fallback to the render's own `src/spec`) | render `agent/spec-bank-tools.ts`, tool `t27_specs`                              | `found`, `path_readable`, `falls_back` |

**The neuro-office** (owner, same evening: "the team members must be in these
channels -- that is the point of the neuro-office; live people and agents"):
every member is in every channel. A message that OPENS with a member's name
("Казначей, ...", "@navigator ...") is answered in that channel by the member
named, its answer opening with its name; the channel keeps its memory
(`speaker`, `addressed`, `labelled`, `GUEST_KEEPS_CHANNEL_MEMORY`; render
`profession.ts` `speakerFor`, `chat.ts` `teamSection`). The render decides it,
so the bot and the mini-app get it alike. Only the person's own turns: never
a client's DM, a client thread, the Queen or a catalogue specialist. Live
people join through a forum GROUP (a private chat holds one person) -- the
office is a forum group: `/office` (spec `bot-neuro-office.t27`,
`topics/office.ts`) -- in a forum where the bot manages topics, at an admin's
word -- makes the whole team's channels there. People talk freely; an agent
answers only when spoken to (reply, `@bot`, command -- groupAddressing.ts) or,
in an office only, when a message opens with a member's name. A channel speaks
as its member (the bot sends `member`, the render gives the turn that trade,
the room keeps its memory). A room carries no pay buttons. Each rule is a
host function pinned by the spec's vectors; the numbers come from gen-ts.

**The office hears the room (spec v2, #3897/#3898).** A person's line nobody
addressed to the agent is recorded into the room's memory as "Name: text"
(`hearInOffice`, through `recordTurns` with `room`) and never answered; only
in an office, never a bot or a command, cut to `HEARD_MAX_CHARS`. An asked
turn carries `speaker` beside `room`; the render names the STORED line
(`roomLine` in routes.ts) and asks the model the bare text. Never prefix the
question itself: the render finds a member named first ("Treasurer, ...") at
the start of the text, and "Anna: Treasurer, ..." would hide it.

**`/catchup` (spec v3, #3899).** In an office only (`mayCatchUp`): the agent
is asked, as the person, in the room, from the channel's member, to name what
was decided, what is open and who took what on (`CATCHUP_PARTS`, the parts
live in `CATCHUP_PARTS_TEXT`). An empty or failed answer is said, never
silence. Check the whole office in one command: `tri office [--mutants]`.

**Hand-off (spec v4, #3900).** A line of a member's answer in an office that
opens with a colleague's name ("Treasurer, count the budget") is asked of
that colleague once (`handOffInOffice`, `HANDOFF_DEPTH_MAX` 1), in the
person's name, with `speaker` = the handing member's label; the colleague
answers in the room as "💰 Treasurer: ...". A failed or empty colleague turn
is said. The answering member's own label line is never a hand-off.

**The office's tasks (spec v5, #3901, `topics/officeTasks.ts`).** `/todo
<text>` (owner: the person replied to, else `@named`, else the sender; a forum
topic's own first message is no reply), `/todos` (open, oldest first, at most
`OPEN_TASKS_SHOWN_MAX`), `/done <id>` (owner, author or admin). Table
`office_tasks` on the tokens database, made on first use.

`t27c gen-ts` that lowers function bodies (t27#7872) did NOT merge, even with
the owner's label: `owner-approved-foreign` waives the path check only, never
the foreign-line budget (40 added lines per file, 80 per PR, t27#7371), and the
lowering is 441 lines of Rust. Never build a host on a compiler PR that has not
merged: 999#3895 had to revert its gen-backed re-exports. Body lowering has to
come in t27 itself, not as hand-written Rust.

Traps:

- `registerTabsCommand` now registers `/tabs`, `/team` and a `bot.action`. A
  test double with only `command` silently loses `/tabs` to `/team` -- route
  by name and give it an `action`.
- A hire edit keeps the card's other buttons (`keptRows`): the Agent tab's
  first card also carries the door to the app.
- `teamMarkup` returns `{}` for a whole team: Telegram refuses an inline
  keyboard with no buttons.
- People who already had six tabs keep them: a stored tab is always tended.
- The render's `tabs_setup` tool still makes every tab -- it is the person's
  explicit ask through their agent, not the /start path.

## Common Issues

- **An emoji inside an emoji (owner, 2026-10-08).** A topic with no icon of its
  own is drawn as a coloured circle holding the FIRST CHARACTER of its name. A
  tab named "🤖 Agent" therefore showed the robot inside the circle and again
  beside it. Spec `bot-topic-tabs.t27` v5: the topic name is words only
  (`topicRu`/`topicEn`, `NAME_CARRIES_EMOJI = false`); the emoji is set as the
  icon by a second `editForumTopic` after the topic exists (`ICON_AFTER_CREATE`),
  only when `getForumTopicIconStickers` lists it. Button labels and /team text
  keep the emoji (`ru`/`en`): they are not topic names. Old tabs are renamed
  once by `retitle` and get their icon then.
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
