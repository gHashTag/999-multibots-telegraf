/**
 * Ratchet (census): every place that CREDITS a user (updateUserBalance with
 * PaymentType.MONEY_INCOME) is a mint surface -- a bug there creates money from
 * nothing (replay -> double-credit, forged payload -> credit, amount from
 * untrusted input). This pins the KNOWN population of credit call-sites; a NEW
 * one (a new payment provider, a new refund path) turns the suite RED until it is
 * reviewed for idempotency + authenticity and added to the allowlist below.
 *
 * This is the income-side analog of the charge-side money-map/charge-audit. It
 * does not prove each site is guarded -- it prevents an UNREVIEWED credit site
 * from slipping in silently (the "matcher-defined population" + count-floor
 * discipline: you cannot recount a mint surface you did not enumerate).
 *
 * Each allowlisted file was reviewed in iter234:
 *   payment/top-up (idempotent + authenticated):
 *     robokassa.routes (signature + inv_id UNIQUE), x402.routes (fail-closed,
 *     settlement-gated #1474), tonPaymentScene / tonNativePaymentScene (atomic
 *     status CAS #1548/#1555), paymentProcessing (inngest credit funnel, inv_id).
 *   peer payout: marketplaceService (95% author payout; purchase is idempotent).
 *   refund (reconciles to a prior charge; owner-category, not a mint when the
 *     charge happened): refundUser (ledger-clamped), refundAndTell,
 *     async-lipsync-manager (job.refundIssued flag), musicGenerationWizard,
 *     hedra/heygen/fal-render-wizard (fal is dead code), instagramParserWizard,
 *     videoTranscriptionWizard, generateTextToVideo (refund divergence is
 *     owner-tracked task_5a61b213).
 *
 * loop-fable iter234.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '../..')

// Expected count of `updateUserBalance(... MONEY_INCOME ...)` credit calls per
// file. A file whose count grows, or a new file, is an unreviewed mint surface.
const ALLOWLIST: Record<string, number> = {
  'api_server/routes/robokassa.routes.ts': 1,
  'api_server/routes/x402.routes.ts': 2,
  'core/lipsync/async-lipsync-manager.ts': 1,
  'inngest_app/functions/payments/paymentProcessing.ts': 1,
  'modules/videoGenerator/generateTextToVideo.ts': 1,
  'price/helpers/refundAndTell.ts': 1,
  'price/helpers/refundUser.ts': 1,
  'scenes/instagramParserWizard/index.ts': 1,
  'scenes/lipSyncWizard/fal-render-wizard.ts': 1,
  'scenes/lipSyncWizard/hedra-render-wizard.ts': 1,
  'scenes/lipSyncWizard/heygen-render-wizard.ts': 1,
  'scenes/musicGenerationWizard/index.ts': 1,
  'scenes/tonNativePaymentScene/index.ts': 1,
  'scenes/tonPaymentScene/index.ts': 1,
  'scenes/videoTranscriptionWizard/index.ts': 1,
  'services/marketplaceService.ts': 1,
}

// The primitive itself defines updateUserBalance and only MENTIONS MONEY_INCOME
// in comments -- it is not a credit call-site.
const EXCLUDE = new Set(['core/supabase/updateUserBalance.ts'])

function creditCallsByFile(root: string): Record<string, number> {
  const out: Record<string, number> = {}
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      if (!p.endsWith('.ts')) continue
      const rel = path.relative(root, p)
      if (
        rel.includes('__tests__') ||
        rel.includes('/test') ||
        rel.startsWith('scripts/')
      )
        continue
      if (EXCLUDE.has(rel)) continue
      const lines = fs.readFileSync(p, 'utf8').split('\n')
      let c = 0
      for (let i = 0; i < lines.length; i++) {
        if (/updateUserBalance(Unlocked)?\s*\(/.test(lines[i])) {
          const block = lines.slice(i, i + 8).join('\n')
          if (block.includes('MONEY_INCOME')) c++
        }
      }
      if (c) out[rel] = c
    }
  }
  walk(root)
  return out
}

describe('credit-site census: no unreviewed mint surface', () => {
  const actual = creditCallsByFile(SRC)

  it('floor: the known credit population is present (census not stale)', () => {
    // If the whole population vanished (rename/refactor), this ratchet would
    // pass vacuously. Require the bulk of the allowlist to still be found.
    const found = Object.keys(ALLOWLIST).filter(f => actual[f] > 0).length
    expect(found).toBeGreaterThanOrEqual(Object.keys(ALLOWLIST).length - 2)
  })

  it('no NEW file credits MONEY_INCOME without review', () => {
    const unreviewed = Object.keys(actual).filter(f => !(f in ALLOWLIST))
    expect(
      unreviewed,
      `New MONEY_INCOME credit site(s) not in the census allowlist. A credit ` +
        `creates money -- review the site for idempotency (replay -> double-credit) ` +
        `and authenticity (forged payload -> mint), then add it to ALLOWLIST in ` +
        `creditSiteCensus.test.ts with a one-line rationale.`
    ).toEqual([])
  })

  it('no allowlisted file GREW its credit count (a new unreviewed credit call)', () => {
    const grew = Object.keys(ALLOWLIST).filter(
      f => (actual[f] || 0) > ALLOWLIST[f]
    )
    expect(
      grew.map(f => `${f}: ${actual[f]} > ${ALLOWLIST[f]}`),
      `A file added a MONEY_INCOME credit call beyond its reviewed count. ` +
        `Review the new credit for idempotency + authenticity and bump ALLOWLIST.`
    ).toEqual([])
  })

  it('self-check: the census + allowlist logic flags a synthetic new site', () => {
    const synthetic = { ...actual, 'scenes/newProviderWebhook/index.ts': 1 }
    const unreviewed = Object.keys(synthetic).filter(f => !(f in ALLOWLIST))
    expect(unreviewed).toContain('scenes/newProviderWebhook/index.ts')
    // and a grown count is caught
    const grown = { ...actual, 'services/marketplaceService.ts': 2 }
    const grew = Object.keys(ALLOWLIST).filter(
      f => (grown[f] || 0) > ALLOWLIST[f]
    )
    expect(grew).toContain('services/marketplaceService.ts')
  })
})
