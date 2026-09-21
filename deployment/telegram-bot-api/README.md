# Our own Telegram Bot API server

The cloud Bot API refuses `getFile` above **20 MB**; the mini app takes 100.
Telegram's open-source server in `--local` mode hands over up to **2000 MB**.
This directory is that server as a Railway service, plus what it takes to use
it safely, one bot at a time.

The reasoning — why per bot, why from the token, why a bad value stops the
deploy — is in `src/services/telegramApi.ts`. In one line: after `logOut` a bot
works only through our server, and any request that reaches the cloud later
logs it back in there and splits its updates. Every caller therefore picks the
host from the token it holds, and a bot not listed stays on the cloud.

## What is here

| file               | what it is                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `Dockerfile`       | `aiogram/telegram-bot-api:10.3` pinned by digest, plus node                                              |
| `start.mjs`        | runs the server (the image's own entrypoint) and the file endpoint; if either stops, the container stops |
| `file-server.mjs`  | read-only GET/HEAD of the absolute paths `getFile` returns, port 8082                                    |
| `sweep.mjs`        | removes downloaded media older than `FILES_TTL_HOURS` (default 24)                                       |
| `bot-api-move.cjs` | moves ONE bot to this server (`--apply`) or releases it (`--back`); dry run by default                   |
| `railway.toml`     | build, one replica, redeploy only when this directory changes                                            |

Ports, both on the **private network only**:

- `8081` — the Bot API (`http://telegram-bot-api.railway.internal:8081`)
- `8082` — the files (`http://telegram-bot-api.railway.internal:8082`)

Both carry tokens: 8081 in every URL, 8082 in every path (the server names
each bot's directory by its token). **Never generate a public domain for this
service.** The file endpoint answers 404 for directories — a listing would be
a list of tokens — and refuses traversal, symlinks out and every method but
GET/HEAD.

## Variables — by name only

On **telegram-bot-api** (this service):

| name                | value                                                      |
| ------------------- | ---------------------------------------------------------- |
| `TELEGRAM_API_ID`   | reference: `${{999-multibots-telegraf.TELEGRAM_API_ID}}`   |
| `TELEGRAM_API_HASH` | reference: `${{999-multibots-telegraf.TELEGRAM_API_HASH}}` |
| `FILES_TTL_HOURS`   | optional, default `24`; `0` keeps media forever            |

No bot token is ever set on this service.

On **999-multibots-telegraf** (the one place the values are written):

| name                      | value                                                       |
| ------------------------- | ----------------------------------------------------------- |
| `TELEGRAM_API_ROOT`       | `http://telegram-bot-api.railway.internal:8081`             |
| `TELEGRAM_API_FILES_ROOT` | `http://telegram-bot-api.railway.internal:8082`             |
| `BOT_API_LOCAL_BOTS`      | empty at first; then `username=id` entries, comma-separated |

On **vibee-render** — references, so the two services cannot disagree about a
bot:

| name                      | value                                                 |
| ------------------------- | ----------------------------------------------------- |
| `TELEGRAM_API_ROOT`       | `${{999-multibots-telegraf.TELEGRAM_API_ROOT}}`       |
| `TELEGRAM_API_FILES_ROOT` | `${{999-multibots-telegraf.TELEGRAM_API_FILES_ROOT}}` |
| `BOT_API_LOCAL_BOTS`      | `${{999-multibots-telegraf.BOT_API_LOCAL_BOTS}}`      |

`BOT_API_LOCAL_BOTS` takes bot ids or `username=id`. A bare username is
refused at startup on purpose: turning a name into an id takes a `getMe`, and
a `getMe` on the wrong server is exactly the request that logs a bot in there.
`bot-api-move.cjs --apply` prints the exact entry. A malformed value of any of
the three stops the deploy with the variable's name in the log — loud, instead
of a bot quietly sent to the wrong server.

## Railway steps, in this order

### 1. Create the service (nothing changes for anyone)

1. Project **999** → New → GitHub repo `gHashTag/999-multibots-telegraf`,
   service name **`telegram-bot-api`**.
2. Settings → Source → **Root directory** `deployment/telegram-bot-api`.
3. Settings → Networking: **no public domain, no TCP proxy.** The private name
   is `telegram-bot-api.railway.internal`.
4. Add a **volume** mounted at **`/var/lib/telegram-bot-api`** (bot sessions
   and downloaded media; 20 GB is ample with the 24 h sweep).
5. Variables: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` as references (table
   above).

### 2. Deploy it and check it (still nothing changes for anyone)

`railway logs --service telegram-bot-api` shows the upstream command line
(`telegram-bot-api --dir=/var/lib/telegram-bot-api ... --local ...`) and

    [files] read-only file endpoint on [::]:8082, root /var/lib/telegram-bot-api, uid 101

From a sibling service, the private network answers:

    railway ssh --service 999-multibots-telegraf
    node -e "fetch('http://telegram-bot-api.railway.internal:8082/healthz').then(r=>r.text()).then(console.log)"
    # ok

Push a commit that touches only `src/` afterwards: this service must NOT
redeploy (`watchPatterns`). A restart here is a few seconds of silence for
every bot on it.

### 3. Point both services at it, still with no bot on it

On 999-multibots-telegraf set `TELEGRAM_API_ROOT`, `TELEGRAM_API_FILES_ROOT`
and an empty `BOT_API_LOCAL_BOTS`; on vibee-render the three references.
Redeploy both. The boot logs say:

    bot:    Bot API: 0 of 12 bot(s) on our server
    render: 🤖 Bot API: 0 bot(s) on our server, every bot on the cloud

Every bot is still on the cloud; behaviour is identical to before.

### 4. Move ONE low-traffic bot

    railway ssh --service telegram-bot-api
    node /opt/bot-api/bot-api-move.cjs <username>            # dry run: the plan, no calls
    node /opt/bot-api/bot-api-move.cjs <username> --apply    # token at a hidden prompt

`--apply` checks this server answers, checks the token is the bot you named,
logs it out of the cloud, logs it in here, and prints the entry, e.g.
`Kaya_easy_art_bot=61234567890`. From that moment until the redeploy the bot
does not answer (the running process still asks the cloud), so go straight on:

    railway variables --service 999-multibots-telegraf --set 'BOT_API_LOCAL_BOTS=<entry>'
    # redeploy 999-multibots-telegraf AND vibee-render

Check:

- bot log: `Bot API: 1 of 12 bot(s) on our server (<id>) at http://telegram-bot-api.railway.internal:8081`;
- the bot answers `/start`;
- a 40 MB video sent to it in the agent chat arrives as an attachment line
  with a shelf URL instead of the 20 MB refusal;
- `railway logs --service telegram-bot-api` shows no errors.

Leave it a day. Then the next bot: append its entry with a comma.

**Two limits that stay.** Our shelf (`/upload` on the render) keeps files up
to 100 MB, like the mini app; a 100–2000 MB file is refused with a sentence
naming 100 MB. And the limits on what our code SENDS (50 MB per upload in
`ai-reels-callback.ts`, which matches the cloud) are not raised here.

### 5. Rollback

One bot back to the cloud:

1.  Remove its entry from `BOT_API_LOCAL_BOTS` on 999-multibots-telegraf;
    redeploy 999-multibots-telegraf and vibee-render. Every call for it now
    goes to the cloud.
2.  Then release it here (while our bot service still polled this server,
    `close` would be undone by the next getUpdates):

        railway ssh --service telegram-bot-api
        node /opt/bot-api/bot-api-move.cjs <username> --back

3.  The cloud refuses a bot for 10 minutes after its `logOut` and takes it back
    on the first request after that.

Everything back: every entry out, both services redeployed, `--back` for each
bot. Then the three variables can go, and the service with its volume (it holds
only sessions and cached media).

## Checks for the first rollout

- **The sweep.** A media file older than `FILES_TTL_HOURS` is deleted; a later
  `getFile` for it should make the server download it again (tdlib re-checks
  its local copy). Confirm once on the first bot; if it does not, set
  `FILES_TTL_HOURS=0` and grow the volume instead.
- **IPv6.** Both ports listen on `::`. If the bot cannot reach
  `telegram-bot-api.railway.internal`, the boot log of this service shows the
  listen addresses; `TELEGRAM_HTTP_IP_ADDRESS` and `FILES_HOST` override them.
- **Other holders of a moved bot's token.** Every caller in this repository
  resolves the host from the token (`src/__tests__/telegramApiRootCensus.test.ts`
  keeps it so). A service outside this repository holding the same token would
  still call the cloud; check before moving a bot that one uses.
