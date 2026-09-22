# Main Mini App in @BotFather, from the owner's account

**Owner, 2026-09-22:** every link to our app must open inside Telegram.
Asked whether to do it through his account, he answered
«да, настрой через мой аккаунт» ("yes, configure it through my account").

A `https://t.me/<bot>?startapp=<route>` link opens the app in one tap only
when the bot has a **Main Mini App**. No Bot API method turns that on: the
switch sits in @BotFather behind inline buttons. When measured the same day,
`getMe.has_main_web_app` was `false` for every farm bot that was checked.

## The tool

`botfather_main_app { bot: '@username', url?: string, dry_run?: boolean }`:
a render MCP tool, in `apps/vibee-editor/render/src/agent/botfather-main-app.ts`.

| Rule              | How it holds                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner only        | `requireOwner(ctx)`, the gate every owner-only tool uses. It runs first.                                                                                                                                              |
| Direct calls only | The tool is in `DIRECT_CALL_ONLY` (tools.ts). `/mcp` lists it, but a model turn in the render never sees it and is refused if it calls it anyway.                                                                     |
| Inside the render | The run uses `withClient(ctx)`: the owner's session from `tg_sessions` or `TELEGRAM_SESSION_STRING`. Using the same key from a second process risks `AUTH_KEY_DUPLICATED`, which would sign the owner out everywhere. |
| Farm bots only    | `tokenForBot`: the render's own tokens, matched by username via getMe on `telegramApiFor(token)`.                                                                                                                     |
| Our app only      | The URL defaults to the bot's `getChatMenuButton` web_app URL, fetched on the bot's own host. It must be `https://app.t27.ai` or `https://vibee-editor-production.up.railway.app`.                                    |
| Proven            | Afterwards, `getMe.has_main_web_app` must be `true`. Otherwise the result is `unverified`, whatever BotFather said.                                                                                                   |

## The path it walks

1. `open`: send `/mybots`.
2. `pick_bot`: press `@username`, matched exactly. The driver turns `»` pages up to 5 times.
3. `bot_settings`: press `Bot Settings`.
4. `configure_mini_app`: press `Configure Mini App` or `Mini App`.
5. `enable_mini_app`: press `Enable Mini App` or `Turn on`. If the screen shows `Disable Mini App` or `Edit Mini App URL`, the run returns `already_on`.
6. `send_url`: send the URL, but only after BotFather's message asks for one.
7. `confirm`: a refusal stops the run, even when the same reply also says "updated".
8. `verify`: call getMe.

The accepted labels live in `STEP_LABELS`. The dry-run plan is built from that
same table. Labels match exactly after emoji and case are trimmed, never as
substrings. If two buttons match one label, the run stops.

**Every step has a 20 s timeout.** The run stops, and returns the step, the
reason, BotFather's texts (tokens redacted) and the labels on the screen, when:

- a button is missing
- a label is doubled
- a button is a url or web-view button rather than a callback button
- BotFather gives a reply the driver does not recognise
- the timeout expires

Each step writes one log line: `[botfather-main-app] @bot <step> ok|stop (reason)`.

## First live run

1. `dry_run: true` for one bot. Check the URL and the plan.
2. Run that one bot. Expect `status: "enabled"` and `has_main_web_app: true`.
3. If it stops, read `transcript` and `last_buttons`. If BotFather renamed a
   label, add the new wording to `STEP_LABELS` together with a test in
   `the-main-mini-app-is-switched-on-by-the-owner.test.ts`. Never loosen the
   match to a substring.
4. Run the rest of the farm one bot at a time. A second call during a run is
   refused, because BotFather keeps one conversation per account.
