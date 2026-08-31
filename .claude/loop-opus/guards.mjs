#!/usr/bin/env node
// tri guards -- run the critical money/security/reliability RATCHETS as one fast
// focused suite (a self-healing check), instead of the full ~3260-test run.
//
// WHY. Each of these tests pins an INVARIANT a money/security bug had already
// regressed once: a paid generation must never price to 0, a deduction must hold
// the per-user lock, a payment InvId must be deterministic, privileged commands
// must be admin-gated, webhook routes must guard JSON.parse, debug endpoints must
// be NODE_ENV-gated, the public/protected router split must hold, every Inngest
// function must be served-or-explained. Other agents share this repo; running
// this list after a sync catches a regression in seconds. This just codifies the
// list I would otherwise retype by hand each iteration.
//
// Usage: node .claude/loop-opus/guards.mjs        # run + summarize
//        node .claude/loop-opus/guards.mjs --list # print the tracked files

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// The critical invariant ratchets. Add a file here when you ship a new one.
const GUARDS = [
  'src/__tests__/money/unifiedModelPriceFailClosed.test.ts', // #1458 fail-closed price
  'src/__tests__/money/processBalanceVideoOperationNonPositive.test.ts', // #1461 non-positive price
  'src/__tests__/money/paymentHandlerInvIdDeterministic.test.ts', // #1430 InvId determinism
  'src/__tests__/money/unlockedDeductionLocked.test.ts', // #1432 balance-lock hatch
  'src/__tests__/money/creditNotInLoop.test.ts', // #1468/#1470 credit-in-loop mint
  'src/__tests__/security/privilegedCommandAdminGate.test.ts', // #1441 admin gate (addbalance mints)
  'src/__tests__/security/x402CreditFailClosed.test.ts', // iter189 x402 credit fail-closed (no settlement verify)
  'src/__tests__/security/creditWebhookAuthenticated.test.ts', // iter190 repo-wide: every credit-route authed before crediting
  'src/__tests__/money/inngestMoneyInStepRun.test.ts', // iter191 inngest money mutations wrapped in step.run (retry-idempotent)
  'src/__tests__/reliability/inngestStepIdStaticInLoop.test.ts', // iter192 no static inngest step id inside a loop (memoization collision)
  'src/__tests__/reliability/chatWithAvatarDeliveryFallback.test.ts', // iter194 image delivery has document fallback (charge-no-delivery mitigation)
  'src/__tests__/money/videoPollChargeIdempotent.test.ts', // iter195 i2v poll-loop charge is idempotency-guarded (no 120x re-charge)
  'src/__tests__/security/voiceAvatarNoTokenLog.test.ts', // iter195 createVoiceAvatar does not console.log the bot-token-bearing fileUrl
  'src/__tests__/money/emailWizardPriceAllowlist.test.ts', // iter196 emailWizard setPayments gated by paymentOptions allowlist (no price bypass)
  'src/__tests__/reliability/avatarBrainNoHtmlParse.test.ts', // iter196 avatarBrainWizard no parse_mode:HTML on raw user text (no 400)
  'src/__tests__/helpers/voiceValidation.test.ts', // iter197 voice pointer cleared only on authoritative absence (no wipe on key-gap/outage)
  'src/__tests__/security/statsBotAccessFailClosed.test.ts', // iter197 interactiveStats bot-access guards fail closed on null ownedBots
  'src/__tests__/reliability/aiReelsVoiceCheckGraceful.test.ts', // iter198 ai-reels pre-charge voice check proceeds on non-authoritative (no false recreate)
  'src/__tests__/inngest/trainingDedupIncludesPending.test.ts', // iter198 model-training duplicate guard covers the PENDING window (no dup Replicate train)
  'src/__tests__/security/avatarTransformQuotaGuard.test.ts', // iter199 free-superhero gen has in-flight lock + quota re-check (no concurrent quota bypass)
  'src/__tests__/security/aiPhotoshopMorphingEviction.test.ts', // iter200 aiPhotoshop clears cross-scene morphingImages with every image-source reset
  'src/__tests__/reliability/wan25PollBackoff.test.ts', // iter200 WAN2.5 poll loop backs off on the unknown-state fall-through (no busy-loop)
  'src/__tests__/reliability/routesJsonParseGuarded.test.ts', // #1431 webhook JSON.parse
  'src/__tests__/reliability/debugRoutesGated.test.ts', // #1434 debug endpoints NODE_ENV-gated
  'src/__tests__/reliability/routerMountAuthBoundary.test.ts', // #1436 requireInternalKey boundary
  'src/__tests__/inngest/functionGranularRegistration.test.ts', // #1439 Inngest liveness
]

const ROOT = process.cwd()

function main() {
  if (process.argv[2] === '--list') {
    for (const g of GUARDS) console.log(g)
    return
  }
  // A stale entry (a renamed/removed ratchet) must fail loud, not be skipped --
  // a guard list that silently drops a guard is worse than no list.
  const missing = GUARDS.filter(g => !fs.existsSync(path.join(ROOT, g)))
  if (missing.length) {
    console.error('tri guards: tracked ratchet file(s) missing:')
    for (const m of missing) console.error('  ' + m)
    process.exit(2)
  }
  const bin = path.join(ROOT, 'node_modules', '.bin', 'vitest')
  try {
    // vitest exits non-zero if any test fails; inherit stdio so the report shows.
    execFileSync(bin, ['run', ...GUARDS], { stdio: 'inherit', cwd: ROOT })
    console.log(`\ntri guards: all ${GUARDS.length} invariant ratchets GREEN.`)
  } catch {
    console.error(
      `\ntri guards: a critical invariant ratchet is RED (regression). Fix before shipping.`
    )
    process.exit(1)
  }
}

main()
