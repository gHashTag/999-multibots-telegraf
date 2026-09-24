#!/bin/bash
# tri tag URL CHANNEL [campaign] -- the link as that channel should carry it.
#
# The same tagger the agents use (render src/agent/utm.ts `tagged`):
# utm_source/utm_medium/utm_campaign on our pages (t27.ai, app.t27.ai), and
# the channel at the end of the /start payload on a link into our bot
# (`?start=app_feed` -> `?start=app_feed__reddit`). Somebody else's link
# comes back exactly as given. For links the owner posts by hand, so a
# visit or a bot start from them is counted by channel too (`tri traffic`).
#
#   tri tag 'https://t27.ai/#/blog/x' reddit blog
#   tri tag 'https://t.me/t27ai_bot?start=app_feed' telegram
set -u
ROOT="${1:?repo root required}"
shift
URL="${1:-}"
CH="${2:-}"
CAMP="${3:-}"
[ -n "$URL" ] && [ -n "$CH" ] || { echo "usage: tri tag URL CHANNEL [campaign]"; exit 2; }
cd "$ROOT/apps/vibee-editor/render" || exit 2
TAG_URL="$URL" TAG_CH="$CH" TAG_CAMP="$CAMP" npx --no-install tsx -e '
const { tagged, CHANNELS } = require("./src/agent/utm")
const ch = String(process.env.TAG_CH).toLowerCase()
if (!(ch in CHANNELS)) {
  console.log(`unknown channel "${ch}"; one of: ${Object.keys(CHANNELS).join(" ")}`)
  process.exit(2)
}
const url = process.env.TAG_URL
const out = tagged(url, ch, { campaign: process.env.TAG_CAMP || undefined })
console.log(out)
if (out === url) console.error("(unchanged: not our page, not our bot payload, or already tagged)")
' 2>&1 | grep -v ExperimentalWarning
