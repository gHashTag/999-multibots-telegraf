# Server-owned project sync contract

## Goal

One private project document must open from the web editor, the native iOS
editor, and the owner's agent without copying identity or timeline state into
three incompatible stores. The existing `projects` table and `/api/projects`
routes are the source of truth; this adds clients, not a second API.

## Identity and ownership

- Web uses verified Telegram Mini App init data or an app bearer session.
- Native uses the app bearer session.
- Agent tools receive owner identity only from `ToolContext.telegramId`.
- Client arguments never select an owner. Another owner's id reads as missing.

## Versioned document

`composition.schemaVersion = 1` is a JSON superset:

- `fps`, `width`, `height`, and `tracks` are the native contract.
- Clips retain `assetId` and a resolved `url`, so iOS can open their media.
- `assets` restores web metadata.
- `captions`, `captionStyle`, and `showCaptions` preserve timed subtitle state.
- Unknown keys are preserved by the server and ignored by older clients.

## Conflict behavior

- Opening the editor never silently replaces local work.
- Cloud load and save are explicit owner actions.
- Blank ids receive a collision-resistant client id before first save.
- A failed load/save leaves the local editor untouched.

## Agent surface

- `projects_list` returns owner metadata.
- `project_get` returns one owner-scoped draft.
- `project_save` stores a draft; it never renders, publishes, generates, or
  spends credits.

## Acceptance

Web serialization round-trips project/tracks/assets/timed captions/style,
requests contain no client owner id, agent SQL always binds the verified owner,
malformed documents fail before atom mutation, and web/render/iOS gates stay
green on the exact commit.
