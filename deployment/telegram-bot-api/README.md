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

| file               | what it is                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `Dockerfile`       | `aiogram/telegram-bot-api:10.3` pinned by digest, plus node                                             |
| `start.mjs`        | runs the server on loopback, the proxy and the file endpoint; if any part stops, the container stops    |
| `api-proxy.mjs`    | port 8081: only bots on the allow-list, and no `file:/` value anywhere in a request                     |
| `allowed-bots.cjs` | the allow-list: a file on the volume written by the move script, plus `BOT_API_ALLOWED_IDS` (step 4b)   |
| `file-server.mjs`  | port 8082: read-only GET/HEAD of exactly `<root>/<bot>/<media dir>/<file>`, the paths `getFile` returns |
| `sweep.mjs`        | removes downloaded media older than `FILES_TTL_HOURS` (default 24)                                      |
| `bot-api-move.cjs` | moves ONE bot here (`--apply`) or releases it (`--back`, `--forget`); dry run by default                |
| `railway.toml`     | build, one replica, redeploy only when this directory changes                                           |

## The ports, and why "private network" is not the boundary

The service gets **no public domain and no TCP proxy**. But the Railway private
network is shared with the per-person browser pod: its Chromium has no egress
filter, a person drives it from the mini app, and an agent can open any http(s)
address in it (`docs/architecture/remote-browser-per-user.md` §4.3 asks for the
browser to be cut off from our network; the Railway pod is not). So each port
carries its own rule:

- `8081` — **the proxy** (`http://telegram-bot-api.railway.internal:8081`).
  The server itself listens on `127.0.0.1:8083` only, forced in `start.mjs`.
  The proxy passes `/` (so services can see the server is up) and
  `/bot<token>/<method>` for a bot **on this server's allow-list** — the server
  would otherwise start a client for any token, a throwaway bot from BotFather
  included. And it refuses any `file:/` value: in `--local` mode a send method
  accepts `file:///any/path` as the file to send, which would mail
  `tqueue.binlog` (the pending updates of every bot here) or another bot's
  session to whoever asked. Refused in the query, JSON and urlencoded bodies,
  multipart text parts and nested JSON, under any escaping. The cost: a message
  whose own text starts a value with `file:/` is refused too.
- `8082` — **the files** (`http://telegram-bot-api.railway.internal:8082`).
  Exactly the shape `getFile` answers — `<root>/<token dir>/<media dir>/<file>`
  — and nothing else: not `tqueue.binlog` or `webhooks_db.binlog` at the root
  (fixed names, no token needed to ask for them), not a bot's `td.binlog` or
  `db.sqlite`, not a directory (a listing of the root is a list of tokens), not
  anything through a symlink. Reading a file takes the token.

The allow-list lives on the volume beside the sessions, one `username=id` per
line; `bot-api-move.cjs` adds and removes bots, inside the container. It is a
file and not a variable because it must change at the moment a bot moves, and a
variable here changes only with a redeploy — a restart under every bot already
on the server.

The proxy also lets through the ids in **`BOT_API_ALLOWED_IDS`** on this
service — for a move without a shell in this container (step 4b). A malformed
entry is skipped and logged by its position, never its text; it does not stop
the container, because a crash loop here would silence every bot already moved.
The boot line lists the ids it took, so a mistyped id shows.

## Variables — by name only

On **telegram-bot-api** (this service):

| name                  | value                                                      |
| --------------------- | ---------------------------------------------------------- |
| `TELEGRAM_API_ID`     | reference: `${{999-multibots-telegraf.TELEGRAM_API_ID}}`   |
| `TELEGRAM_API_HASH`   | reference: `${{999-multibots-telegraf.TELEGRAM_API_HASH}}` |
| `FILES_TTL_HOURS`     | optional, default `24`; `0` keeps media forever            |
| `BOT_API_ALLOWED_IDS` | optional; `username=id` entries, comma-separated (step 4b) |

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
The id is the number before the colon of the bot's token. A malformed value of
any of the three stops the deploy with the variable's name in the log — loud,
instead of a bot quietly sent to the wrong server.

**Two bots never move**, and listing either stops the deploy: the bot of
`BOT_TOKEN_1`, which carries the admin alerts — including the alert that this
server is down — and the render's default cashier, `TOKENS_PAYMENT_BOT_TOKEN`,
which mints every invoice a person's own bot cannot.

## Railway steps, in this order

### 1. Create the service (nothing changes for anyone)

1. Project **999** → New → GitHub repo `gHashTag/999-multibots-telegraf`,
   service name **`telegram-bot-api`**.
2. Settings → Source → **Root directory** `deployment/telegram-bot-api`.
3. Settings → Config-as-code → **Railway config file**
   `/deployment/telegram-bot-api/railway.toml`. Railway does not look for the
   file under the Root Directory (the config path is resolved from the repo
   root; `.claude/skills/vibee-stack-hard-won/SKILL.md`, Railway). Without this
   step `watchPatterns`, `restartPolicyType` and `numReplicas` are silently
   ignored: every push to main would redeploy this server, and each redeploy is
   seconds in which every bot on it is unreachable.
4. Settings → Networking: **no public domain, no TCP proxy.** The private name
   is `telegram-bot-api.railway.internal`.
5. Add a **volume** mounted at **`/var/lib/telegram-bot-api`** (bot sessions,
   the allow-list and downloaded media; 20 GB is ample with the 24 h sweep).
6. Variables: `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` as references (table
   above).

### 2. Deploy it and check it (still nothing changes for anyone)

A service's first deployment can race the Root Directory setting and build the
repo-root Dockerfile; if the log shows the bot's build, redeploy once.

In the deployment's details, confirm the **watch paths, restart policy and
replicas came from the config file** before anything else.

`railway logs --service telegram-bot-api` shows the upstream command line
(`telegram-bot-api --dir=/var/lib/telegram-bot-api ... --local ...
--http-ip-address=127.0.0.1`) and

    [api] Bot API proxy on [::]:8081 -> 127.0.0.1:8083, allow-list: 0 bot(s) in the file, 0 in BOT_API_ALLOWED_IDS, uid 101
    [files] read-only file endpoint on [::]:8082, root /var/lib/telegram-bot-api, uid 101

From a sibling service, the private network answers — and refuses a bot that
is not listed:

    railway ssh --service 999-multibots-telegraf
    node -e "fetch('http://telegram-bot-api.railway.internal:8082/healthz').then(r=>r.text()).then(console.log)"
    # ok
    node -e "fetch('http://telegram-bot-api.railway.internal:8081/bot1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/getMe').then(r=>r.status).then(console.log)"
    # 403

Push a commit that touches only `src/` afterwards: this service must NOT
redeploy (`watchPatterns`, from the config file of step 1.3).

### 3. Point both services at it, still with no bot on it

On 999-multibots-telegraf set `TELEGRAM_API_ROOT`, `TELEGRAM_API_FILES_ROOT`
and an empty `BOT_API_LOCAL_BOTS`; on vibee-render the three references.
Redeploy both. The boot logs say:

    bot:    Bot API: 0 of 12 bot(s) on our server
    render: 🤖 Bot API: 0 bot(s) on our server, every bot on the cloud

Every bot is still on the cloud; behaviour is identical to before.

### 4. Move ONE bot — point first, move second

Pick a low-traffic bot, not `BOT_TOKEN_1` and not the default cashier. Do it in
a quiet hour, with the bot's agent chats idle: a redeploy stops the turns that
are running, and step 4.3 drops whatever is still queued for the bot on the
cloud.

1.  Add its entry to `BOT_API_LOCAL_BOTS` on 999-multibots-telegraf:

        railway variables --service 999-multibots-telegraf --set 'BOT_API_LOCAL_BOTS=<username>=<id>'

2.  Redeploy **999-multibots-telegraf and vibee-render**, and wait until both
    are live. The bot log says `Bot API: 1 of 12 bot(s) on our server (<id>)`
    and then, once a minute, that `getMe still fails` with a 403 naming the
    allow-list. That is expected: both services now send this bot only to our
    server, and the proxy refuses it until it moves. **From here the bot is
    silent**, so go straight on.

    If either redeploy does not go live, nothing has moved: the old processes
    still serve the bot from the cloud. Take the entry out again (or fix and
    redeploy) — and do not run step 3.

3.  Move it:

         railway ssh --service telegram-bot-api
         node /opt/bot-api/bot-api-move.cjs <username>            # dry run: the plan, no calls
         node /opt/bot-api/bot-api-move.cjs <username> --apply    # token at a hidden prompt

    `--apply` checks this server answers, checks the token is the bot you
    named, logs it out of the cloud (the time is printed: note it for a
    rollback), puts it on the allow-list and logs it in here.

4.  Within a minute the bot log says
    `Bot API: listed bot <id> answers; launching it` — the bot service retries a
    listed bot that does not answer, so no redeploy is needed. The render's
    cashier list catches up within five minutes.

Why this order: no process is left pointing the bot at the cloud when it logs
out, so there is no 10-minute race. (The other order — logOut first, then
redeploy — leaves the old processes asking the cloud, and if a redeploy is not
live 10 minutes after the logOut, their next request logs the bot back into the
cloud while this server also holds it.)

If `--apply` stops **before** the logOut, nothing moved; the bot is silent
only because of step 2 — take the entry out and redeploy, or fix and rerun.
If it stops **after** the logOut (our server did not log the bot in), the bot
is off the cloud and on the allow-list: fix this server, and the bot service's
retry logs the bot in. Do **not** run `--apply` again.

Check:

- the bot answers `/start`;
- a 40 MB video sent to it in the agent chat arrives as an attachment line
  with a shelf URL instead of the 20 MB refusal;
- `railway logs --service telegram-bot-api` shows no errors.

Leave it a day. Then the next bot: append its entry with a comma, and the same
four steps.

**Two limits that stay.** Our shelf (`/upload` on the render) keeps files up
to 100 MB, like the mini app; a 100–2000 MB file is refused with a sentence
naming 100 MB. And the limits on what our code SENDS (50 MB per upload in
`ai-reels-callback.ts`, which matches the cloud) are not raised here.

### 4b. Move ONE bot without a shell in this container

`railway ssh` is not open to every operator. The same move in three steps, none
of which needs this container's shell; the property is the one above — no
process points the bot at the cloud when it logs out, and this server never
holds the bot while the cloud does.

1.  Point first: steps 4.1 and 4.2 exactly as above, and make sure
    vibee-render carries the reference
    `BOT_API_LOCAL_BOTS=${{999-multibots-telegraf.BOT_API_LOCAL_BOTS}}`. Wait for
    BOTH boot lines from the deployments that are live now: the bot's
    `Bot API: 1 of N bot(s) on our server (<id>)` and the render's line naming
    the bot on our server. The bot is silent from here. If either redeploy does
    not go live, do **not** run step 2: take the entry out and redeploy.

2.  Log it out of the cloud — **once** — from a checkout, under the render's
    variables (the only service holding the farm's tokens and both bots that
    never move):

        railway run --service vibee-render -- node scripts/bot-api-move.cjs <username>=<id>                               # dry run
        railway run --service vibee-render -- node scripts/bot-api-move.cjs <username>=<id> --cloud-logout --pointed

    The dry run says whether the real run would be refused, and why.
    `--pointed` is your statement that you saw both boot lines of step 1. The
    real run refuses before any call unless both never-move tokens are in the
    environment and the bot is neither, and unless `BOT_API_LOCAL_BOTS` parses
    as the services parse it and names the id. It finds the token among the
    variables by the id (nothing typed, nothing printed), checks it on the
    cloud, logs out, and prints the time — note it for a rollback.

    If the cloud check fails for any reason other than "logged out" (no
    network, 401, a proxy page), the script says **STOP** and nothing changed:
    do not do step 3. Never run step 2 twice for a bot: a cloud `getMe` more
    than 10 minutes after the logOut logs it back in there.

3.  Let it through here. `--set` replaces the whole value, so read it first:

        railway variables --service telegram-bot-api --kv | grep '^BOT_API_ALLOWED_IDS='
        railway variables --service telegram-bot-api --set 'BOT_API_ALLOWED_IDS=<current>,<username>=<id>'

    The redeploy restarts this server — seconds in which bots already here are
    unreachable; the bot service retries them. The boot line lists the ids it
    took (`BOT_API_ALLOWED_IDS <id>`); within a minute the bot log says
    `Bot API: listed bot <id> answers; launching it`.

If step 3's redeploy does not go live, the bot is off the cloud and not here:
fix the redeploy, or roll back (below, "our server is down").

**Observed on the first move (HaimGroupMedia_bot, 2026-09-22): the cloud
takes a bot back AT ONCE.** Three minutes after a successful `logOut`, a stale
copy of `scripts/bridge.cjs` (one that asked `api.telegram.org` for every
token) got normal answers to `getMe`, `getChatMenuButton` and
`getMyCommands` for the moved bot, and a second `--cloud-logout` five minutes
after the first found the bot logged in on the cloud again and logged it out.
No "10 minutes" and no "Logged out" answer protected it. So for a moved bot,
**every** request to the cloud, at any time, logs it back in there:

- run `tri` and every script from a checkout of current main — the host is
  chosen per token only there (`scripts/lib/telegram-api.cjs`); a stale
  checkout of the bridge or of any one-off script that loops over
  `BOT_TOKEN_*` against `api.telegram.org` is the danger, not the services;
- if it happened, run step 2 again at once — it is safe whatever the cloud
  answers — and the bot service keeps its session on our server;
- from a laptop the bridge shows a moved bot as `on our Bot API server; not
reachable from here`. Its health is the `[bot-api]` lines of the bot log.

**Rollback without a shell.** Take the entry out of `BOT_API_ALLOWED_IDS`: the
redeploy restarts this server, which then runs no polling bot until one is
requested — what `close` would do — and the proxy refuses the bot, so nothing
launches it here again. Then remove it from `BOT_API_LOCAL_BOTS` and redeploy
both services, not earlier than 10 minutes after the logOut. Inside the
container, `--back` refuses a bot the variable lets through (a close would be
undone within seconds), and `--forget` clears the file and names the variable
step that remains.

### 5. When this server stops answering

While any bot is listed, the bot service probes both ports once a minute
(`src/services/botApiServerMonitor.ts`), logs every failed probe as
`[bot-api] ... does not answer`, and tells the admin once when a port goes down
and once when it comes back — through `BOT_TOKEN_1`, on the cloud. A listed
bot whose server was down when the bot service booted is launched as soon as
the server answers again.

### 6. Rollback

**Our server is up** (the usual case):

1.  Release the bot here first:

        railway ssh --service telegram-bot-api
        node /opt/bot-api/bot-api-move.cjs <username>=<id> --back

    It calls nothing unless the id is the token's, the bot is on the
    allow-list and this server holds its session. Then it closes the bot and
    takes it off the allow-list, after which the proxy refuses it, so the
    running bot service cannot launch it here again. The bot is silent until
    step 2. `close` is refused for 10 minutes after this server launched the
    bot; the script then says so and changes nothing — run it again later.

2.  Remove its entry from `BOT_API_LOCAL_BOTS`; redeploy 999-multibots-telegraf
    and vibee-render **not earlier than 10 minutes after the logOut** that moved
    it (`--apply` printed the time). The cloud refuses the bot until then. The
    bot service retries a bot the cloud refuses for about 17 minutes, so an
    early redeploy costs minutes of silence, not the bot.

**Our server is down** (the likely reason to roll back):

1.  Skip `--back`: it needs the server. Remove the entry, redeploy both
    services — again not earlier than 10 minutes after the logOut.
2.  When the server is back, take the bot off its allow-list without calling
    anything:

        node /opt/bot-api/bot-api-move.cjs <username>=<id> --forget

    A restarted server runs no polling bot until one is requested (only bots
    with a webhook are restored at startup, ClientManager.cpp) — the state
    `close` would have produced. `--back` here would first launch it again.

Everything back: each bot released as above, the three variables removed, and
then the service with its volume (it holds only sessions, the allow-list and
cached media).

## Checks for the first rollout

- **The sweep.** A media file older than `FILES_TTL_HOURS` is deleted; a later
  `getFile` for it should make the server download it again (tdlib re-checks
  its local copy). Confirm once on the first bot; if it does not, set
  `FILES_TTL_HOURS=0` and grow the volume instead.
- **IPv6.** The proxy and the file endpoint listen on `::`. If the bot cannot
  reach `telegram-bot-api.railway.internal`, the boot log of this service shows
  the listen addresses; `API_HOST` and `FILES_HOST` override them. The server
  itself stays on `127.0.0.1` whatever the variables say.
- **Other holders of a moved bot's token.** The bot service and the render
  resolve the host from the token (`src/__tests__/telegramApiRootCensus.test.ts`
  keeps it so). Scripts that hold real tokens refuse to run without the
  service's `BOT_API_LOCAL_BOTS` (`assertBotApiListKnown`; run them under
  `railway run -s 999-multibots-telegraf`), and the runbooks (`/doctor`,
  `/check`) resolve the host per token from the service's variables and skip a
  bot that is not on the cloud; the census covers both. A service outside this
  repository holding the same token would still call the cloud; check before
  moving a bot that one uses.
