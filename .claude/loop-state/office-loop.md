# Neuro-office loop: people and agents in one group

Loop memory for the 15-minute cron. Read it first and do not redo what is done
or undo what is merged. Epic gHashTag/999-multibots-telegraf#3896.

## Rules of the loop

- Spec first: every rule goes into `bot-neuro-office.t27` in gHashTag/t27, and
  only then into `src/navigation/topics/office.ts`.
- Never build a host on a compiler PR that has not merged. t27#7872 (gen-ts
  bodies) cannot merge: the owner's label does not lift the 40/80 foreign-line
  budget. Rules stay host functions pinned by spec vectors.
- Do not edit the working tree while `scripts/test-guard.cjs` and the push are
  running: the guard tests the tree and the push takes HEAD as it is then.
- Start every tick with `tri office` (laws, suites); `tri office --mutants`
  before a PR (the list is src/spec/bot-neuro-office.mutants.json; add a
  mutant for every new rule, or the list goes stale).
- A wait loop must not grep for its own command line: `pgrep -f "git push
-q -u origin claude/vibrant"` inside an `until` matched itself and hung for
  30 minutes (2026-10-08). Wait on a background task's notification instead.
- Hand-off rides the prompt that already exists: profession.ts tells every
  member "call a colleague by naming them first". The bot scans the SENT
  answer (after markers are stripped) for such a line, skips the member's own
  "Director:" label, asks the colleague once (depth 1) in the person's name.
- A database fake filters only by what its SQL names (blind-guards): the
  office_tasks fake hid done tasks by itself and a mutant "/todos shows done
  tasks" survived until the fake read `NOT done` from the SQL (2026-10-08).
- In a forum topic every message "replies" to the topic's first message:
  `repliedPerson` drops it, or every /todo would belong to the topic's maker.
- Agent-proposed tasks ride a marker `[[todo:Name|what]]`, stripped BEFORE
  `buttonsForAnswer`: its generic pass strips `[[...]]` only up to 60
  characters, so a long task marker would reach people as bracket soup.
- A fake bot passed to `registerOfficeTasks` needs `action` as well as
  `command` since v7 (three tests went red on `bot.action is not a function`).
- Merge with a merge commit when the local gates are green. 999 GitHub
  Actions never start (billing); the local gates are the check.

## Weak points and status (updated 2026-10-09)

| #   | Issue | Weak point                                    | Status                                                    |
| --- | ----- | --------------------------------------------- | --------------------------------------------------------- |
| 1   | #3897 | agent deaf to people in the room              | done: spec v2 t27#7922, #3904                             |
| 2   | #3898 | room memory does not say who said what        | done: spec v2, #3904                                      |
| 3   | #3899 | no /catchup                                   | done: spec v3 t27#7933, #3906                             |
| 4   | #3900 | no hand-off between members                   | done: spec v4 t27#7949, #3907                             |
| 5   | #3901 | decisions do not become tasks                 | done: spec v5 t27#7954, #3908                             |
| 6   | #3902 | /office refusals untested                     | done: #3909 (coverage)                                    |
| 7   | #3910 | /catchup forgets the tasks                    | done: spec v6 t27#7964, #3911                             |
| 8   | #3912 | the agent assigns work, nobody writes it down | spec v7 t27#7999; host in PR (marker -> button -> press)  |
| 9   | #3913 | office not linked to the client CRM           | spec bot-office-crm v1 t27#7999; host in PR (client card) |
| 10  | #3903 | one call per heard message                    | open                                                      |
| 11  | --    | never run with live people in prod            | needs the owner: a forum group, /office, two people       |

## The office and the CRM (2026-10-09)

- The CRM knows a client's group (`crm_client_groups`, owner binds it with
  `crm_client_group`). The office in that group keeps `office_tasks` in the
  SAME Postgres (the bot's TOKENS_DATABASE_URL is the render's DB; the bot and
  the render already share `crm_autopilot` that way).
- The link runs ONE way: the owner's client card lists the office's open
  tasks; a room turn never gets a client's card (`ROOM_SEES_CLIENT_CARD`),
  because the client may be in that room and the card holds the owner's notes.
- Not done yet (candidates): the agent in the client's thread putting a task
  into the client's office; `/todos` naming the client; tasks in the app's
  client card (the player), not only in the agent's brief.

## Competitors (from memory, not measured live)

- ChatGPT group chats: reads the whole thread, answers when mentioned; personal
  memory stays out of the group.
- Microsoft Teams Facilitator: notes, decisions and tasks over the whole chat.
- Slack channel agents: channel context, answers when invoked.

Our edge: each agent has a trade and every tool, the room has its own memory,
pay buttons stay in the person's Treasurer tab.
