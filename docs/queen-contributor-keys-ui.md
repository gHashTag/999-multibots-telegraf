# Contributor keys and XP: UI extension

This note records the existing app conventions used by the personal contribution
screen. It is scoped to this feature; it does not define a new global design
system.

## Implementation

- [App.tsx](../apps/vibee-editor/player/src/App.tsx) registers `/game/account`
  before the `/game/*` board route.
- [HiveAccount.tsx](../apps/vibee-editor/player/src/pages/HiveAccount.tsx) renders
  the contribution owner, server-provided XP and work totals, key fingerprints,
  health results with timestamps, and add/check/enable/disable controls.
- [HiveAccount.css](../apps/vibee-editor/player/src/pages/HiveAccount.css) scopes
  the account layout and the profile entry. The key list changes from four
  columns to two at 850px and below; the form changes to one column at 480px
  and below.
- [HiveAccountLink.tsx](../apps/vibee-editor/player/src/components/Profile/HiveAccountLink.tsx)
  exposes the entry only for the own profile. [Profile.tsx](../apps/vibee-editor/player/src/pages/Profile.tsx)
  includes it during loading and onboarding as well as on the completed profile.
- [TelegramTabBar.tsx](../apps/vibee-editor/player/src/components/Navigation/TelegramTabBar.tsx)
  adds a contextual account link on game routes. Its
  [stylesheet](../apps/vibee-editor/player/src/components/Navigation/TelegramTabBar.css)
  retains the incumbent desktop and keyboard visibility rules.

## Local conventions

The account inherits the Outfit font stack from
[index.css](../apps/vibee-editor/player/src/index.css). It uses the existing
`--vibee-*` surface, border, text, and accent references with local fallbacks.
Black surfaces and the mint accent continue the incumbent app palette. The
global stylesheets are not modified by this extension.

The account uses separated rows, a maximum content width of 1120px, and controls
with a minimum height of 44px. Focus outlines use the accent color. Health is
expressed with text as well as color; status updates use a polite live region,
and errors use an alert. These are account-specific implementation choices, not
new rules for the whole app.

User-facing account copy is in the shared English and Russian dictionaries in
[language.ts](../apps/vibee-editor/player/src/atoms/language.ts). The UI displays
server-provided scoring terms and identifies XP as game points, without wallet
conversion. The API-key field is a password input, is cleared on submission,
and is not rendered in the key list. These are source observations, not an audit
of the deployed storage or authentication system.

## Evidence boundary

The documentation check inspected the component, styles, route and profile
integration, navigation diff, dictionaries, and the local QA harness. It did not
run a production browser session or call an external model provider.

[hive-account.qa.tsx](../apps/vibee-editor/player/hive-account.qa.tsx) renders the
real account and tab bar with Russian fixture data. It replaces `window.fetch`,
implements local key responses, and returns an offline response for other
requests. It includes explicit fixture labeling and empty/unconfigured states.
Its displayed XP, identities, health statuses, and timestamps are examples, not
verified account activity. A successful action in this harness does not prove
authentication, durable storage, Queen connectivity, live provider quota, or
deployment. [HiveAccount.test.tsx](../apps/vibee-editor/player/src/pages/HiveAccount.test.tsx)
contains mocked interaction coverage; this note does not claim a test run.

Existing vocabulary already mixes legacy names and current colors: for
example, `index.css` assigns mint to `--color-brand-amber` and exposes legacy
`--vibee-*` aliases. The account follows those existing references; this check
does not rename tokens or repair unrelated style drift.
