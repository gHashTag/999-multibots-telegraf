# CI on Railway loop

Loop memory for the 15-minute cron (TRI_LOOP=ci). Read it first; do not redo what
is merged. Epic gHashTag/999-multibots-telegraf#3950. Skill `railway-ci`.

## Rules of the loop

- Decisions go into spec `automation/ci-bridge` (gHashTag/t27) first, then
  `deployment/ci-bridge/bridge.mjs` calls `spec/ci-bridge.logic.ts`.
- Run `node --test deployment/ci-bridge/bridge.test.mjs` and the root vitest on
  `deployment/ci-bridge` before every push; hand-mutate every new rule.
- Never backfill old PRs (SINCE); never run a fork head.
- Merges of ci-bridge changes may be SKIPPED by Railway: check `list-deployments`
  and `redeploy` the skipped id.

## СЕЙЧАС В РАБОТЕ

- Tick 2: spec v2 (t27#8310) heal + /recheck; `tri ci --recheck`.

## Что уже есть

- #3944 bridge + Actions gated by CI_ENABLED; #3945 SINCE; #3946 app auth;
  #3947 app wins; #3949 check-run mode.

## План

- [ ] Owner gives the bees app `Checks: write` -> first live mark on a fresh PR.
- [x] t27#8300 merged.
- [x] Railway auto-deploys ci-bridge on merge (the deploy of #3953 built itself).
- [ ] Mark main's head too (base red vs PR red).
- [x] Re-run on request: `/recheck` (spec v2, t27#8310).
- [x] Self-healing deploy when Railway skips a merge (spec v2 heal_due).

- 09.10.2026 19:43: live after #3953 -- the Node 22 host runs the spec logic; the app may
  not mark; the fallback token (TRIOS_QUEEN_RELEASE_TOKEN) is refused on this private repo
  too. Only the owner's permission grant unblocks marks. The fallback now lasts one pass.

- 09.10.2026 20:10: self-heal worked live (stale 9e36392d4 -> asked Railway -> 82409df40
  deployed). Perms logged: checks=read issues=write pull_requests=write. Spec v3
  (t27#8330) marks by the app's own PR comment. Next: seal-based skip of t27c test-report
  for vendored specs whose sha256 equals the t27 seal (35 of 48 match; full --run 25 s).
