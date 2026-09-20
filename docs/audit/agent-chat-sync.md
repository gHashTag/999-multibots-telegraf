# Agent chat sync across app / bot / mini app / web

**Branch: `agent-chat-sync-audit` (off `main`, not merged, not pushed).**
Six defects fixed and verified building; one structural gap (correlation id
across the whole turn) closed; one feature gap (profile editing on iOS) found
and scoped but not built. Competitor research not done this pass — `WebSearch`
was down for the whole session (backend model error, unrelated to this repo).

## Where "one conversation" actually lives

Confirmed by reading the real code, not assumed: the agent chat is genuinely
one conversation across three surfaces (`AgentChatView.swift`'s own doc names
them: `bot | miniapp | ios | agent`), backed by one Postgres table
(`agent_messages`) that `routes.ts`/`chat.ts` (`runAgent`) reads and writes.
"App" and "site" in the task both point at the same React codebase
(`apps/vibee-editor/player`) — one serving Telegram's WebView, the other the
plain browser build. The bot (`src/services/trinityAgent.ts`) is a fourth,
separate client of the same endpoint.

## Defects found and fixed (commits on this branch)

1. **iOS sign-in copy was stale and vague.** `SignIn.swift` said "open the bot"
   without naming which one; `AgentChatView`'s guest-mode message pre-dated
   code-based sign-in and told people to paste a nonexistent "agent key".
   Fixed: names `@t27ai_bot` with a tappable link, current copy everywhere.

2. **"Взять" (Take) button gave zero feedback on its own tab** — it worked,
   but the only visible effect was on a different tab entirely. Fixed: haptic
   + a 1.2s "Добавлено" state at the tap site.

3. **Chat media preview broke on HEIC photos and voice memos.** Three
   independent extension-guessing copies (`ChatAssets.tsx` client-side,
   `render-server.ts`'s `/s3/` proxy) disagreed with each other and neither
   knew HEIC/HEIF. An iPhone photo with no other conversion path got routed
   into the proxy's "must be video, run ffmpeg" branch and produced nothing.
   `.webm` was classified audio server-side, video client-side — a voice
   message rendered as a silent black video player. Fixed both lists, added
   an `<img onError>` fallback so an expired signed URL degrades to a link
   instead of a permanently broken icon.

4. **iOS's NDJSON parser silently dropped 2 of 5 documented event types.**
   `ошибка` (mid-turn error) and `готово`/`обрыв` (step-limit truncation) fell
   into `default: break`. Both the bot and the web client already learned to
   surface these — each after its own dated production incident — and iOS
   never got the fix. A truncated or errored answer on the phone looked
   identical to the agent going silent.

5. **iOS discarded a partial answer on any stream failure.** A transport drop
   after the agent had already dictated half an answer overwrote the visible
   text with `"Не дошло до сервера: ..."` instead of appending to it. The bot
   (2026-09-16, "KEEP WHAT ALREADY ARRIVED") and the web client (08.09.2026,
   `receivedText && m.text ? ... : ''`) had each independently fixed this
   exact class of bug; iOS had neither.

6. **Zero client-error telemetry existed on iOS.** The web has posted to
   `/api/client-error` since 08.09.2026, which the server turns into a
   deduped Telegram alert to the owner. `grep -rn client-error apps/vibee-ios`
   returned nothing before this pass. Every defect above was found only
   because a person happened to complain in this conversation — the same
   class of bug on web is already visible without anyone complaining.
   Added `ClientErrorBeacon.swift`, same wire shape as the web beacon,
   flushed once per launch, wired into the stream-failure path.

## Structural fix: one correlation id across the whole turn

Before this pass, `chat.ts`'s `runAgent` — the one place all three surfaces
converge — logged nothing structured for a whole turn: `grep console\.` found
eight one-off `console.warn` calls about individual subsystems and nothing
that says "turn X from Y started / ended like this, in Z ms, N tool calls".

Added one structured start/end log line under `[agent:turn]`, and a new first
stream event `{тип: 'ход', id}` so bot/web/iOS can attach it to their own
error reports.

**Self-correction worth recording**: the first draft of this minted its own
`randomUUID()` inside `runAgent`, without noticing that `routes.ts:568`
already mints a `turn` id on every `/api/agent/chat` call — the same one that
guards the proposal-secret race in `web-tools.ts`. Caught before merging by
re-reading `ToolContext`'s own fields. Fixed to reuse `ctx.turn`. Lesson: when
adding an id/token/counter to a hot path, grep the surrounding context object
for one first — this codebase already mints a lot of them.

## Process violation, corrected

The first several commits on this branch introduced new Cyrillic identifiers
and comments (`ходId`, `был_текст`, `кнопкаВзять`, all of `ClientErrorBeacon.swift`,
...) — a direct violation of the project's own stated rule (this file, this
sentence: identifiers and comments in English; `.swift` is explicitly in
`lefthook.yml`'s `no-cyrillic` glob, with its own documented incident about a
`.swift` file once slipping through). The violation shipped because this
clone never ran `npm install` / `lefthook install`, so no hook ever ran
against these commits — caught only because the user read the diff and
objected.

All 233 flagged lines across 9 files were rewritten in English and the branch
now passes `node scripts/no-cyrillic-guard.cjs range main..agent-chat-sync-audit`
clean (exit 0). **Lesson for the next session, recorded here so it doesn't
have to be relearned**: run the cyrillic guard against the branch range
*before* claiming a commit is done, not after the user notices. `tri` now has
a command for this — see below.

## Found, scoped, not built: profile editing is web-only

`apps/vibee-editor/player/src/atoms/profile.ts:264` (`updateProfileAtom`) can
`PUT /api/users/:username` to change `display_name`, `bio`, `avatar_url`,
`is_public`, `social_links`. `apps/vibee-ios/Vibee/API.swift` and
`ProfileScreen.swift` can only **read** `display_name`, `bio`, `avatar_url` —
no `is_public`, no `social_links`, no cover photo, no write path of any kind.
Someone editing their bio on the phone app cannot; the same person in the
Telegram mini app can. This is a real feature gap, not a bug in existing
code, and building an edit UI well (field layout, avatar upload flow, how
`social_links` — currently a single opaque string on the wire — should be
edited) is a separate decision from anything else in this pass. Flagged for
the owner in the report, not built speculatively.

## Not done this pass

- **Competitor research** (`WebSearch` was down for the whole session —
  backend "glm-4.5-flash" model error, confirmed unrelated to this repo by
  testing `WebFetch` against a plain URL, which worked). Retry next session.
- **Idempotency on the user's own turn.** `chat.ts` records "the LAST user
  turn of what arrives" per request. The web client retries once on a
  pre-first-token network drop (`agentStream.ts`, `MAX_ATTEMPTS`), gated on
  `!receivedText`. If a drop lands after the server has already stored the
  turn but before any text streams back, a retry resends the same messages
  array and could double-record the person's own question. Not measured —
  no reproduction attempted, no fix written. Worth a live test with
  artificial latency before deciding whether it is real.
