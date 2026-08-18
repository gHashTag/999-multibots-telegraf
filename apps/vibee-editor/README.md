# VIBEE editor — Telegram Mini App

Vite + React + Remotion Player SPA, deployed as the `vibee-editor` service in
Railway project **999** (production).

## Layout

```
apps/vibee-editor/
  Dockerfile                    multi-stage: node 20 build -> nginx serve
  railway.toml                  service config
  nginx/default.conf.template   ${PORT} substituted at container start
  docker-entrypoint.sh
  player/                       the SPA
  packages/vibee-atoms/         local workspace dep (74 importers)
```

## Railway configuration

**Root Directory must be `apps/vibee-editor`** — not `player/`.
`player/package.json` depends on `file:../packages/vibee-atoms` and vite aliases
`@vibee/atoms` to `../packages/vibee-atoms/src`. Both escape `player/`, and a
Docker build context cannot COPY above its own root.

Watch patterns are scoped to `apps/vibee-editor/**` so bot-only changes do not
rebuild the editor. The bot service deliberately has **no** watch patterns and
still deploys on every push — narrowing it risks a real change silently not
deploying.

## Local development

```bash
cd apps/vibee-editor/player
npm ci          # .npmrc sets legacy-peer-deps; @sentry/react@7 peers react 15-18, app is react 19
npm run dev
```

Build with `npm run build` (`vite build`). **Not** `npm run build:check` — that
runs `tsc -b`, which surfaces 519 pre-existing type errors in this tree.

## Telegram Mini App

- `index.html` loads `telegram-web-app.js` as a classic head script; the module
  entry is deferred, so the launch fragment is parsed before React boots.
- `src/lib/telegram.ts` — accessors. Detection keys off **non-empty `initData`**,
  not the presence of `window.Telegram`, which exists in plain browsers too.
- `src/hooks/useTelegramWebApp.ts` — `ready()`/`expand()`, disables vertical
  swipes, publishes viewport + safe-area insets as `--app-*` properties, wires
  the native BackButton to router history.
- `src/components/Telegram/TelegramProvider.tsx` — redirects the launch route
  `/` to `/feed`. Telegram can only open the BotFather URL at `/`, which renders
  the marketing landing — the one page the tab bar hides on.

Write `--app-*`, never `--tg-*`: telegram-web-app.js owns that namespace and
overwrites it on every `viewportChanged`.

## Navigation

`src/components/Navigation/TelegramTabBar.tsx` is the single navigation surface —
9 tabs: feed, search, learn, editor, avatar, video, image, audio, profile.
`VerticalTabs` and `BottomNavigation` are its predecessors; both were dead code
and are superseded.

Layout compensation is applied to `#root`, not per-page classes: Search's root
element is `.leads-dashboard`, not `.search-page`.

## Known issues

- `src/pages/Token.tsx` is a 0-byte file that `App.tsx` lazy-imports and routes
  `/token` to. Navigating there throws.
- `public/` is ~90MB of media that the default project loads at runtime. It is
  98% of the deployed artifact and belongs on a CDN.
