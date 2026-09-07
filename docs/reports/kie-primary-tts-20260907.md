# Kie primary speech wave

Issue: #2139. Base: origin/main b39b86ec6. Scope: web audio picker and
server/agent speech dispatch; no credential or provider mutations.

## Behavior contract (before implementation)

- Kie is first and selected on entering audio. Direct speech is opt-in.
- Kie stock voices are independent of the direct-provider cache and endpoint.
  The documented Rachel voice is the initial supported stock voice, not a
  claimed owner clone. Source checked 2026-09-07:
  https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2
- A missing/bad direct ElevenLabs credential must not gate a Kie request.
- Switching provider must not retain another provider's error or voice ID.
- Omitted-model server/agent audio requests choose Kie. Explicit Kie failure
  must not silently buy speech from a different provider. Existing auth,
  charging, per-character units and refund semantics must remain protected.
- Do not promise aligned subtitles when Kie returns none.
- Verification uses mocked provider calls only; no generated/published media.

## Plan

1. [x] Fresh git inventory and production UI read; canonical dirty tree untouched.
2. [x] Coordinate issue/overlaps; separate backend audit assigned.
3. [x] Deterministic RED tests for actual picker and dispatch behavior.
4. [x] Minimal implementation and GREEN regressions.
5. [x] Typecheck/build, fresh browser QA, mutation check, independent review.
6. [ ] Report exact local/PR state without claiming deployment.

## Checkpoints

- BASELINE: production audio DOM has Direct first and Kie labeled backup;
  source default is direct/elevenlabs and voice fetch runs regardless of model.
- COORDINATION: #2130/#2138 do not own audio behavior; render-server/tools file
  overlap exists and must be reviewed. No blind merge of earlier worktrees.
- UI RED: mounted GeneratePanel tests failed 4/4 on default/order, payload,
  provider error isolation and stale generation error. After correcting one
  unsupported matcher, all four failed for the intended behavior.
- UI GREEN: same four behavioral tests plus voice/catalog/money wiring: 27/27.
  Old global receipt-clear count was replaced with per-dispatch assertions,
  so an additional clear on provider switching cannot mask a missing clear.
- TYPECHECK PREFLIGHT: first player tsc could not resolve shared atom package
  dependencies; installing the package lock before rerun. Not a passing gate.
- UI FOLLOW-UP: independent review found the optional Direct view could offer
  legacy MiniMax voices after Direct-only dispatch was enforced. Added a fifth
  behavioral RED test; Direct now requires its actual catalog provider and
  blocks submission when unavailable. Kie remains selectable/usable.
- INTEGRATION PREREQUISITE: main has 39 grouping type errors. Imported only
  the optional FeedTemplate.compositionId and response projection from agent
  commit e9d5ac75 (#2130), not its navigation/hive/runtime changes. Existing
  type ratchet now PASS: 5 errors against threshold12 (SoulEditor1 and upload
  test4 remain). Raw player tsc is NOT green.
- BUILD/BROWSER: production Vite build PASS. Separate no-write local preview
  checked with Neo at390/720/1440: no horizontal overflow, Kie first/selected,
  direct voice reads0 until opt-in; after Direct selection exactly1, restored
  Kie shows Rachel. EN/RU labels verified. Model controls61px tall on phone.
  All preview provider calls0; live synthesis not attempted.
- FULL PLAYER: 274 tests pass; ProfileTabs suite fails at collection because
  its pre-existing jotai mock lacks atom. Not hidden or marked green.
- SERVER GREEN: 63 focused tests pass. Actual extracted HTTP/tool bodies
  prove Kie default, pre-charge model validation, provider failure with no
  cross-provider retry, exact model/character price and refund. Direct
  timestamp alignment remains supported only on explicit Direct selection.
- MUTATIONS: reverting HTTP default and separately UI default to Direct both
  fail their primary-path tests. Both deliberate mutations were restored.
- REVIEW: independent scoped review found no P0/P1. Direct catalog and stale
  pricing-summary P2 findings were corrected and rechecked. Initial49
  independent tests passed; final commit checks follow after hook formatting.
- BUILD: root typecheck/build and player/render bundles PASS. Render's plain
  typecheck has4 pre-existing sibling-player ImportMeta.env ambient errors;
  supplying --types vite/client passes. Full test typecheck has7 pre-existing
  errors outside scoped changes. No unqualified full-typecheck claim.
- PREREQUISITE/LEGACY LIMITS: iOS still uses a model-agnostic voice catalog;
  older root voice-clone/render pipelines are not migrated in this wave.
  Current fix covers web picker, render audio endpoint and unified agent tool.
  No live provider health/generation, credential rotation or deployment.
- FINAL STYLE GATE: the initial commit attempt was rejected by the repository
  Cyrillic guard after formatting exposed existing protocol identifiers on
  changed lines. Added narrow compatibility annotations; no guard bypass or
  rule changes. Formatted/staged backend remains 63/63 green; staged guard and
  diff checks pass. Frontend focused follow-up is 38/38; new-file lint passes.
