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

- Tick 1 (2026-10-09 evening): spec t27#8300, host binding, token fallback, `tri ci`.

## Что уже есть

- #3944 bridge + Actions gated by CI_ENABLED; #3945 SINCE; #3946 app auth;
  #3947 app wins; #3949 check-run mode.

## План

- [ ] Owner gives the bees app `Checks: write` -> first live mark on a fresh PR.
- [x] t27#8300 merged.
- [x] Railway auto-deploys ci-bridge on merge (the deploy of #3953 built itself).
- [ ] Mark main's head too (base red vs PR red).
- [ ] Re-run on request: a PR comment `/recheck` resets the mark.

- 09.10.2026 19:43: live after #3953 -- the Node 22 host runs the spec logic; the app may
  not mark; the fallback token (TRIOS_QUEEN_RELEASE_TOKEN) is refused on this private repo
  too. Only the owner's permission grant unblocks marks. The fallback now lasts one pass.
