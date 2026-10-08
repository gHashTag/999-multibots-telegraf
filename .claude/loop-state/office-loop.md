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
- Merge with a merge commit when the local gates are green. 999 GitHub
  Actions never start (billing); the local gates are the check.

## Weak points (self-review 2026-10-08) and status

| #   | Issue | Weak point                             | Status                                                                                      |
| --- | ----- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | #3897 | agent deaf to people in the room       | spec v2 t27#7922; host in PR (8/8 mutants)                                                  |
| 2   | #3898 | room memory does not say who said what | spec v2 t27#7922; host in PR                                                                |
| 3   | #3899 | no /catchup                            | open                                                                                        |
| 4   | #3900 | no hand-off between members            | open                                                                                        |
| 5   | #3901 | decisions do not become tasks          | open                                                                                        |
| 6   | #3902 | /office refusals untested              | mostly covered already by src/spec/bot-neuro-office.test.ts (/office block); check the rest |
| 7   | #3903 | one call per heard message             | open                                                                                        |

## Competitors (from memory, not measured live)

- ChatGPT group chats: reads the whole thread, answers when mentioned; personal
  memory stays out of the group.
- Microsoft Teams Facilitator: notes, decisions and tasks over the whole chat.
- Slack channel agents: channel context, answers when invoked.

Our edge: each agent has a trade and every tool, the room has its own memory,
pay buttons stay in the person's Treasurer tab.
