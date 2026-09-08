import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * THE URL WE HAND ROBOKASSA MUST BE A URL WE ANSWER.
 *
 * Robokassa credits a top-up by calling a URL back. That URL was built as
 * `${base}/payment-success`, while the router that serves it is mounted at
 * '/api'. Measured live against production on 2026-09-08:
 *
 *     GET https://<prod>/payment-success       -> 404
 *     GET https://<prod>/api/payment-success   -> 200 {"status":"ok"}
 *
 * 164 Robokassa rows are PENDING and 67 people were never credited. Not one has
 * completed since November 2025; the single repair on record was done by hand in
 * February 2026, row `fix-264623904`, reason "OutSum string/number comparison
 * bug". Nothing watched, so nobody found out for ten months.
 *
 * Every test around this route until now checked SHAPE -- that a guard exists,
 * that the claim is set before crediting, that public webhooks mount before
 * keyed ones. Shape cannot see this defect: both halves were individually
 * correct and disagreed only about where they met. So this file compares the
 * two halves against each other:
 *
 *   the path the config hands the provider  ==  a path the real router serves
 *
 * The router paths are read off the REAL router object and the prefix off the
 * REAL mount line, so moving either half breaks this test.
 */

const supabase = vi.hoisted(() => ({
  getPaymentByInvId: vi.fn(),
  updateUserBalance: vi.fn(),
  notifyBotOwners: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(() => supabase.supabaseAdmin),
    update: vi.fn(() => supabase.supabaseAdmin),
    eq: vi.fn(() => supabase.supabaseAdmin),
    select: vi.fn(async () => ({ data: [{ id: 1 }], error: null })),
  } as any,
}))

vi.mock('@/core/supabase/payments', () => ({
  getPaymentByInvId: supabase.getPaymentByInvId,
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: supabase.updateUserBalance,
}))
vi.mock('@/core/supabase/notifyBotOwners', () => ({
  notifyBotOwners: supabase.notifyBotOwners,
}))
vi.mock('@/core/supabase', () => ({
  supabaseAdmin: supabase.supabaseAdmin,
  getPaymentByInvId: supabase.getPaymentByInvId,
}))
vi.mock('@/core/bot', () => ({
  getBotByName: vi.fn(async () => ({
    bot: { telegram: { sendMessage: vi.fn(async () => undefined) } },
  })),
}))

import router from '@/api_server/routes/robokassa.routes'

/** Paths the real router declares for POST -- read off the router, not the source. */
function servedPaths(): string[] {
  const layers = (router as any).stack as any[]
  const paths = layers
    .filter(l => l.route?.path && l.route?.methods?.post)
    .map(l => String(l.route.path))
  expect(
    paths.length,
    'the router declares no POST routes at all -- this test could not fail'
  ).toBeGreaterThan(0)
  return paths
}

/** The prefix the app really mounts this router under. */
function mountPrefix(): string {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/api_server/index.ts'),
    'utf-8'
  )
  const m = src.match(/app\.use\(\s*'([^']+)'\s*,\s*robokassaRouter\s*\)/)
  expect(
    m,
    'no `app.use(<prefix>, robokassaRouter)` found in api_server/index.ts'
  ).toBeTruthy()
  return (m as RegExpMatchArray)[1].replace(/\/+$/, '')
}

/** Re-evaluate config with a chosen base, so the test drives the input. */
async function resultUrlFor(base: string | undefined) {
  vi.resetModules()
  const keep = {
    API_SERVER_URL: process.env.API_SERVER_URL,
    RESULT_URL2: process.env.RESULT_URL2,
    SERVER_PUBLIC_URL: process.env.SERVER_PUBLIC_URL,
    BASE_WEBHOOK_URL: process.env.BASE_WEBHOOK_URL,
  }
  /*
   * SET TO EMPTY, DO NOT DELETE.
   *
   * `src/config/index.ts` calls `dotenv.config()` on every fresh import, and
   * dotenv fills in variables that are ABSENT from process.env from `.env` on
   * disk. Deleting a key here therefore did nothing on any machine with a
   * `.env` -- the module re-import put RESULT_URL2 straight back, and the
   * "nothing configured" case read a real Railway URL and failed. It passed
   * in CI, where there is no `.env`, which is how it went unnoticed.
   *
   * dotenv does not override a variable that is PRESENT, and the code under
   * test treats '' and undefined identically (an `||` chain), so an empty
   * string drives the same branch on every machine.
   */
  for (const k of Object.keys(keep)) (process.env as any)[k] = ''
  if (base !== undefined) process.env.BASE_WEBHOOK_URL = base
  try {
    const mod = await import('@/config')
    return mod.UNIFIED_RESULT_URL
  } finally {
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete (process.env as any)[k]
      else (process.env as any)[k] = v
    }
  }
}

const HOST = 'https://bot.example.test'

describe('the ResultURL handed to Robokassa is a path this app answers', () => {
  const savedNodeEnv = process.env.NODE_ENV
  beforeEach(() => {
    // The chain that runs in production is the one that broke; test that one.
    process.env.NODE_ENV = 'production'
  })
  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv
    vi.resetModules()
  })

  it('points at a path the real router actually serves', async () => {
    const url = await resultUrlFor(HOST)
    expect(url, 'a configured base must produce a URL').toBeTruthy()

    const pathname = new URL(url).pathname
    const prefix = mountPrefix()
    const served = servedPaths().map(p => `${prefix}${p}`)

    expect(
      served,
      `Robokassa would be told to call ${pathname}, which this app does not serve. ` +
        `Served: ${served.join(', ')}`
    ).toContain(pathname)
  })

  it('does not double the prefix when the base already carries it', async () => {
    // RESULT_URL2 is cut at '/payment-success', so its remainder ends in '/api'.
    // A one-directional fix would produce '/api/api/payment-success' here.
    const url = await resultUrlFor(`${HOST}/api`)
    expect(new URL(url).pathname).toBe(
      await (async () => {
        const plain = await resultUrlFor(HOST)
        return new URL(plain).pathname
      })()
    )
    expect(url).not.toContain('/api/api')
  })

  it('yields an empty string when nothing is configured, so the refusal can fire', async () => {
    // `${''}/payment-success` is '/payment-success' -- truthy. Both "missing or
    // empty" checks (config startup and getRuBillWizard/helper.ts) were dead
    // code: an unconfigured deployment silently handed out a relative URL.
    const url = await resultUrlFor(undefined)
    expect(
      url,
      'unconfigured must be falsy so the guards can refuse'
    ).toBeFalsy()
  })
})
