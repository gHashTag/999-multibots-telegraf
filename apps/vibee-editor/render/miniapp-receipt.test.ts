/**
 * Regression test: a paid generation must SAY what it cost.
 *
 * The two numbers exist at the moment of the charge -- billing-shared.ts
 * returns them from the same `UPDATE ... RETURNING balance` that moves the
 * money -- and render-server.ts discarded them, narrowing the charge result to
 * `{ ok: true, tid }`. Every success body therefore carried only url / id /
 * provider, and the ONLY place a person ever saw a number was the 402 refusal,
 * where the amount is baked into prose. The price was known to whoever ran out
 * of it and to nobody else.
 *
 * Two halves are pinned here because the loss had two halves: the numbers must
 * survive chargeMiniAppUser, and they must reach EVERY success body -- NINE of
 * them across four routes, exactly one of which answers from inside a catch
 * (the video Replicate fallback). The first version of this comment said
 * "eight ... the two that answer from inside a catch": both numbers were wrong,
 * and a comment that miscounts the thing it pins is worse than none -- it is
 * the number a later reader trusts instead of counting again.
 *
 * Counted at render-server.ts: image 3179, 3239; video 3479, 3571, 3616;
 * audio 3912, 4008; lipsync 4266, 4355.
 *
 * Booting the server pulls ffmpeg/face-api native deps (a local boot has never
 * worked in this repo), so the wiring is pinned at the source level, exactly as
 * miniapp-billing.test.ts does. The numbers themselves are asserted for real,
 * against billing-shared with a fake pool.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { spendByTid, TOKEN_PRICES } from './src/agent/billing-shared'

const SERVER = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

/**
 * One route handler, bounded by the NEXT route declaration.
 *
 * Every route in this file opens with `  if (req.url` at two-space indent, so
 * that is the boundary. Searching for the next `req.url === ` literal instead
 * runs straight past `/api/balance` (declared with `req.url?.split`) and drags
 * three foreign response bodies into the video slice -- measured: 5 success
 * bodies in a handler that has 3.
 */
function handler(kind: 'image' | 'video' | 'audio' | 'lipsync'): string {
  const start = SERVER.indexOf(`  if (req.url === '/api/generate/${kind}'`)
  expect(start, `${kind} handler not found`).toBeGreaterThan(-1)
  const next = [...SERVER.matchAll(/^ {2}if \(req\.url/gm)]
    .map(m => m.index as number)
    .find(i => i > start)
  return SERVER.slice(start, next ?? SERVER.length)
}

describe('the charge produces numbers', () => {
  it('spendByTid reports what it took and what it left', async () => {
    // A fake pool standing in for the two statements spendByTid runs:
    // ensureRow's INSERT, then the atomic UPDATE ... RETURNING balance.
    const calls: string[] = []
    const pool = {
      query: async (sql: string) => {
        calls.push(sql.trim().split(/\s+/)[0])
        return sql.includes('UPDATE')
          ? { rows: [{ balance: 8 }] }
          : { rows: [] }
      },
    }
    const spent = await spendByTid(
      pool as never,
      'test-not-an-owner',
      'image_generate'
    )
    // ensureRow's INSERT still precedes the atomic UPDATE; the ledger adds
    // its own CREATE/SELECT/INSERT around them (src/token-ledger.ts).
    const moves = calls.filter(c => c === 'INSERT' || c === 'UPDATE')
    expect(moves.slice(0, 2)).toEqual(['INSERT', 'UPDATE'])
    expect(spent.ok).toBe(true)
    // Both numbers, at the moment the money moves. If this ever returns
    // undefined, the receipt below has nothing to carry.
    expect(spent.списано).toBe(TOKEN_PRICES.image_generate) // cyrillic-ok: shared API field
    expect(spent.осталось).toBe(8) // cyrillic-ok: shared API field
  })
})

describe('the numbers survive the charge helper', () => {
  it('chargeMiniAppUser forwards both, instead of narrowing them away', () => {
    // The exact loss this test exists for: `return { ok: true, tid }` dropped
    // both fields one layer above the routes, so no route could have shown
    // them even if every response body had asked.
    expect(SERVER).toContain(
      'receipt: { charged: spent.списано, balance: spent.осталось }'
    ) // cyrillic-ok: shared API field
    expect(SERVER).toMatch(/\{ ok: true; tid\?: string; receipt: Receipt \}/)
  })

  it('names the remaining balance the way /api/balance already names it', () => {
    // One quantity, one wire name. A second name for the same number is a
    // second source of truth, and the client would have to know both.
    expect(SERVER).toContain(
      'type Receipt = { charged?: number; balance?: number }'
    )
    expect(SERVER).toContain('balance: Number(r.rows[0]?.balance ?? 0)')
  })

  it('states nothing rather than zero for the already-paid agent caller', () => {
    // The agent paid at the tool layer; the amount is not known here. An empty
    // receipt keeps that response shape byte-identical to what it was.
    expect(SERVER).toContain(
      "if (authenticate(req).via === 'api-key') return { ok: true, receipt: {} }"
    )
  })
})

describe('every success body carries the receipt', () => {
  for (const kind of ['image', 'video', 'audio', 'lipsync'] as const) {
    it(`${kind}: no success answer is silent about the money`, () => {
      const h = handler(kind)
      // The route must capture the receipt from the charge...
      expect(h, `${kind} never reads billed.receipt`).toContain(
        'receipt = billed.receipt'
      )
      // ...and every single success body must spread it. Counted rather than
      // eyeballed: these routes answer from several branches (an explicit Kie
      // leg, a provider chain, a fallback inside the catch), and it was the
      // branches nobody looked at that stayed silent.
      const successes = (h.match(/success: true/g) || []).length
      const receipts = (h.match(/\.\.\.receipt/g) || []).length
      expect(successes, `${kind} has no success body`).toBeGreaterThan(0)
      expect(
        receipts,
        `${kind}: ${successes} success bodies, ${receipts} carry the receipt`
      ).toBe(successes)
    })
  }

  it('the receipt is declared before the try, so the catch can answer with it', () => {
    // Video answers from INSIDE its catch (the Replicate fallback), and that
    // answer is as charged as any other. A const next to the charge would put
    // it out of scope there and leave exactly one success body silent.
    const video = handler('video')
    expect(video.indexOf('let receipt: Receipt = {}')).toBeLessThan(
      video.indexOf('try {')
    )
  })
})
