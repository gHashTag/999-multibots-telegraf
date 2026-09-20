---
name: client-support-desk
description: "Client service for the bot farm: take in a bug or feature request from DMs, reproduce it, determine the blast radius across the 12 bots, fix, verify, reply. Load on «клиент пишет», «жалоба», «у клиента не работает», «пожелание от клиента», «баг в боте <name>», «ответь клиенту», or 'client reports', 'client complaint', 'bug in bot X', and before any change requested by a specific bot owner."
---

# 🛟 Client support desk

We operate **12 bots out of one shared code tree**. That single fact drives
everything else in this file.

Client and slot registry — [CLIENTS.md](CLIENTS.md).

## The blast-radius rule

**One** container, `999-multibots`, serves all twelve tokens. There is no such
thing as a deploy "just for Kaya".

The live target is a self-hosted VPS at `212.86.115.30`: `.github/workflows/deploy.yml`
rsyncs the tree over SSH and rebuilds the image there. `fly.toml` exists and names
the same app, but no workflow calls `flyctl` — do not assume fly is where a fix
lands.

So every change falls into one of three categories, and **the category must be
decided before any code is written**:

| Category | What it is | Radius |
|---|---|---|
| **Client content** | texts, prices, images, settings in Supabase / `avatars` | 1 bot |
| **botName branch** | `if (botName === 'Kaya_easy_art_bot')` inside shared code | 1 bot, shared code |
| **Shared code** | scenes, navigation, payments, AI providers, middleware | **all 12** |

When a client calls something "a tiny thing", it is almost always the third
category. "Just move a button in my main menu" touches `/src/navigation/`, the
single source of truth for navigation, and ships to all twelve.

**Mandatory question before editing:** if this breaks, how many clients does it
break for? Write the answer in the PR.

## Intake

Clients write free-form, usually without versions or steps. The job is to
reduce that to a reproducible fact **without a ten-question interrogation**.

Open a record in this shape:

```
Client:      <owner name>
Bot:         <bot_name from CLIENTS.md>
Slot:        BOT_TOKEN_N
Type:        bug | feature request | question
Said:        <verbatim quote from the client>
When:        <date/time from the message>
Scene:       <which of the 43+ scenes, if clear>
Radius:      1 bot | all 12 | unknown so far
```

The verbatim quote is mandatory. Paraphrasing drops the one detail that later
turns out to be the cause.

### What not to do at intake

- Do not promise a timeline before reproducing.
- Do not assume "it doesn't work" means our code: 10+ AI providers have their
  own outages, and that is a different answer to the client.
- Do not fix from the description alone, without a log. The client's
  description is a hypothesis.

## Reproduction

In order, stopping at the first hit:

1. **Bot logs.** Winston with correlation IDs — search by `bot_name` and the
   time from the report.
2. **Inngest.** Background jobs run 1–2 hours. "Nothing arrived" usually means
   a failed or stuck Inngest function, not a broken scene.
3. **Provider.** Replicate / Fal / KieAI / OpenAI / Sora / HeyGen each have
   their own status. Check before hunting for a bug of our own.
4. **Secrets.** Infisical is the source of truth; `.env` holds only 5 vars. An
   empty provider key looks exactly like a broken feature from the client's
   side. There is a ready skill for this: `fix-empty-api-keys`.
5. **Scene.** Only now — scene code and wizard transitions
   (`telegram-scenes-master`, `telegraf-wizard-scene-transition`).

Reached the end without reproducing? Say so, and ask for exactly one thing: a
timestamp and a screenshot. Not a questionnaire.

## Fixing

Branch and PR, always. `git push --force` in any form is forbidden — see
`CLAUDECODE_RULES.md`; no exceptions.

The gates will run anyway, so it is cheaper to satisfy them up front:

| Gate | What it catches |
|---|---|
| `security-token-guard.sh` | a token in a commit |
| `tsc --noEmit` | types; do **not** bypass with `--skipLibCheck` or `\|\| true` |
| `no-cyrillic-guard.cjs` | Cyrillic in code and in commit messages |
| `test-guard.cjs` | a change with no test |
| `orphan-events.cjs` | an Inngest event nobody listens to |
| `check-dead-domain.cjs` | a link to a dead domain |

On `tsc` specifically: the first entry in `REGRESSION_PATTERNS.md` is the story
of `--skipLibCheck || true` in the Dockerfile letting type errors into
production, where users found them. The `build:nocheck` script still exists in
`package.json`. It is banned for client work — use `bun run build`.

## Verification before replying

A "fixed" reply may not go out without all three:

1. A test that failed before the change and passes after. Not "the suite is
   green" — the specific test that reproduces the complaint.
2. A hands-on check on the client's own bot after deploy.
3. If radius = all 12: a check on at least one other client's bot as well. A
   fix for one client that breaks the other eleven is the worst outcome in this
   job.

## Replying to the client

The agent **drafts**, the farm owner **sends**. Draft in this shape — keep it
in Russian, the clients' language:

```
<Имя>, по вашему боту <bot_name>:

Что было:  <one line, in the client's words, no jargon>
Причина:   <one line, honest; if it was the provider, say so>
Сделано:   <what changed from the client's point of view, not the code's>
Проверено: <how exactly we confirmed it>
```

Tone rules:

- No `tsc`, `Inngest`, `middleware`. The client bought a working bot, not a
  refactoring report.
- Do not hide the cause. "The provider had an outage" is a fine answer.
  "Technical maintenance was performed" is not an answer.
- Do not estimate work that has not been reproduced.
- Do not promise "it won't happen again" unless a test or monitor was added.

## Feature requests, not bugs

A feature request passes the same radius gate plus one more: **who else gets
it**. A feature ordered by one client ships to all twelve, because the tree is
shared.

Three outcomes; pick one explicitly:

1. **Shared feature.** Ships to everyone. Tell the other eleven — a new
   capability in their bot that they did not ask for is also an event.
2. **botName branch.** Fast, but every such branch is a permanent tax on the
   whole shared tree. Record it as tech debt.
3. **Client config.** The right path: a setting in Supabase, not a branch in
   code. More expensive today, cheaper from the second client who asks for the
   same thing.

Default to the third. Take the second only when the client needs it today.

## What the agent must not do

- **Message clients directly.** Drafting: yes. Sending: the farm owner.
- **Touch tokens.** Not into chat, not into files, not into env vars. Rotation
  at BotFather and storage in Infisical are the owner's own hands.
- **Promise money.** Do not tell a client a change will raise their revenue
  until revenue is actually measurable — see the work order in
  [`../client-daily-report/SKILL.md`](../client-daily-report/SKILL.md).
- **Fix around the PR flow.** Even a one-liner. Even urgently.
