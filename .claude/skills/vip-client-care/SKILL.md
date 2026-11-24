---
name: vip-client-care
description: 'Keeps a VIP client under control and satisfied: one tracker, statuses read from the source, one message with one yes/no list, nothing to prod without the client''s "yes", findings never in public. Use before ANY message or release for a client who has a live product on our platform. Triggers: "VIP client", "keep it under control", "report to the client", "client dashboard", "what is done and what is left", "send to the client", "bring their bot to release"; in Russian: «VIP клиент», «держи под контролем», «отчёт клиенту», «дашборд по клиенту», «что сделано и что осталось», «отправь клиенту», «доведи до релиза его бот».'
---

# VIP Client Care

A VIP client is a person with **a live product on our platform or custom work
with us**: they paid, they have their own bot, mini app, and their own
clients' data. A mistake with them costs not one unhappy message but trust
and their business. Not to be confused with `club-vip-month`, which only
grants a club month for cash.

Worked example: `turbobot-client-delivery` (TurboBaby client, epic #3937) has
the specifics; this skill has the rules for any VIP.

## Satisfied = this, and nothing extra

The client is satisfied when, in one visit, they:

1. see **what is done, what is in progress and what waits for them** --
   short, in writing;
2. answer **one word** to **one yes/no list**, and nothing else is needed
   from them;
3. know that **without their "yes"** nothing went to prod, was moved or sent;
4. find no promises made on the owner's behalf and no invented deadlines.

Do not offer calls if they declined them. Do not ask them to do what we can
do.

**Do not reopen what is closed.** A payment they already made and already
discussed does not go into the report -- no "thanks for the payment", no
reminders (owner, 2026-10-11: "we are past that"). The same for any agreed
topic: the report covers only what is moving now.

## Under control = one tracker and verified statuses

- **One private tracker** (an epic in a private repo) is the only work list
  for the client. Security findings live **only there**.
- **Public is separate and client-free.** An epic in a public repo describes
  the product and the work, without the client's name and without audit
  findings.
- **Every status comes from the source, not from memory:** PR and CI via
  `gh pr view` / `gh run list`, the conversation via `crm_lead_context`,
  deploys via workflow runs. "CI queued" is not "green", and is written as
  such.
- **Every promise is recorded** in the tracker: what, who, when promised. A
  deadline is a debt to be repaid.
- **After every step -- a tracker comment** with what was checked and how.

## Never, however urgent

- **Prod only with their "yes".** Before merging any PR into their repo,
  check whether the merge triggers a deploy (`gh secret list`,
  `gh variable list`, `deploy.yml` triggers). A merge that deploys is a
  deploy. If no deploy is wanted but the merge is needed, the owner decides;
  the agent does not bypass the permission prohibition.
- **Findings never go public:** not to public repos, not to groups with
  outsiders, not via an unauthenticated link. A security report is text in
  Telegram, not a file on a public shelf.
- **Secrets never go through chat.** The client sets a new token themselves,
  or we set it in Railway, but never forward it. If the client sent a key in
  chat themselves -- ask them to revoke it and purge it from the CRM and Zep.
- **Do not answer for the owner:** rights, exit terms, prices, deadlines and
  legal matters are written by the owner in their own words. The agent
  prepares a draft and leaves `‹date›`.
- **Auto-replies off means off.** If the client turned them off, only the
  owner writes; the agent prepares a draft.

## Where to send

Check the chat before sending instead of guessing by its title:

```
tg_common_chats { user: <id> }         chats we share
tg_participants { chat: -100<id> }     who is there: people and bots
tg_history      { chat: -100<id> }     what the chat really is
```

- **A group with outsiders** -- not for a security report.
- **Their agents' notification feed** -- the message drowns, and their bots
  read it.
- **In doubt -- ask the owner**, showing the options and each chat's members.
  Sending is only via `tg_send` (a proposal the owner confirms).

## Report-dashboard template (Telegram, one message)

The message goes in the client's language; the skeleton:

```
<Name>, hi! Briefly, where we are. No call needed.

✅ DONE
• <result> — <how it was checked>

🔄 IN PROGRESS (we do it, nothing from you)
• <what> — <status from the source>

⏳ WAITING FOR YOUR "OK" (one word for all)
1. <action> — <what will and will not happen>

🧭 HONEST ABOUT LIMITS
• <what does not exist yet and why>

From you: "ok", or strike out what is not needed.
```

Template rules: only verified facts; numbers with how they were obtained; no
secrets, no other clients' ids, no internal paths; under 4096 characters (the
Telegram limit).

## Workflow

1. Re-read the client: `crm_lead_context`, `crm_client_timeline`,
   `crm_history`. If they wait for an answer -- answer first.
2. Re-read the tracker and every linked PR/CI -- statuses from the source.
3. Do what needs no "yes" from them, with a test and a negative control
   (split into orders per skill `tri` when there are several parts).
4. Build the report from the template; one yes/no list.
5. Show the owner the text and the recipient; send via `tg_send` after their
   confirmation.
6. Record in the tracker: what was sent, what was promised, by when.

## Пишем на .t27

Owner, 07.10.2026: "we write everything in .t27". Any number, threshold,
rule, price, limit or on-screen order that decides behaviour here is written
as a `.t27` spec FIRST (in `gHashTag/t27`); the host imports the numbers from
`t27c gen-ts` output, and a test runs every spec `test` against the code.
Code without a spec is debt, not the norm. How, the laws and the traps live
only in the skill `t27-spec-first`: this is a pointer, not a copy.

## Related resources

- `turbobot-client-delivery` -- the same approach on a concrete client (epic #3937)
- `tri` -- splitting the work into orders and accepting it
- `three-options-at-the-end` -- how to end the report to the owner
- `telegram-userbot` -- reading and proposing messages through the userbot
- `mcp-owner-access` -- acting as the owner without their credentials
