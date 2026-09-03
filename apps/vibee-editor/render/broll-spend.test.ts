import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import {
  BROLL_CLIP_UNITS,
  brollClaimId,
  claimBroll,
  settleBroll,
} from './src/broll-spend'

/**
 * A paid clip must be claimed before it is bought, and claimed once.
 *
 * The b-roll layer was authorised purely by durable SUCCESS state and left no
 * trace of itself: the cycle's only write happens after publication. Anything
 * that lost the cycle between the money moving and that write -- the render
 * ceiling, a publish failure, a redeploy killing the child -- left the durable
 * state byte-identical to before the spend, so the next tick picked the same
 * topic and bought the same clip again, every thirty minutes, while the clip
 * already paid for was persisted nowhere.
 *
 * The module half is tested behaviourally against a recording database. The
 * ORDER half has to be read from the script, because scripts/ is in no tsconfig
 * and cannot be imported -- and order is the whole point: a claim taken after
 * the provider was called is a receipt, not a guard.
 */

const noop = () => undefined

/** A database that answers what the test tells it to, and records the SQL. */
function fakeDb(answers: { rows: any[] }[] | (() => never)) {
  const sql: string[] = []
  const params: unknown[][] = []
  let i = 0
  return {
    sql,
    params,
    query: async (text: string, p?: unknown[]) => {
      sql.push(text)
      params.push(p || [])
      if (typeof answers === 'function') return answers()
      return answers[Math.min(i++, answers.length - 1)] ?? { rows: [] }
    },
  }
}

const CLAIM = {
  id: 'broll-2026-09-04-Тема',
  owner: 'o1',
  day: '2026-09-04',
  spendTable: 'CREATE TABLE IF NOT EXISTS autopilot_spend ()',
}

describe('заявка на клип берётся до оплаты', () => {
  it('ключ стабилен для одной темы и дня, и различает темы', () => {
    // The retry of the same cycle must produce the SAME key, or nothing dedups.
    expect(brollClaimId('2026-09-04', 'Тема A')).toBe(
      brollClaimId('2026-09-04', 'Тема A')
    )
    expect(brollClaimId('2026-09-04', 'Тема A')).not.toBe(
      brollClaimId('2026-09-04', 'Тема B')
    )
    expect(brollClaimId('2026-09-05', 'Тема A')).not.toBe(
      brollClaimId('2026-09-04', 'Тема A')
    )
  })

  it('свободная тема — заявка взята, и это INSERT ... ON CONFLICT DO NOTHING', async () => {
    const db = fakeDb([{ rows: [] }, { rows: [{ id: CLAIM.id }] }])
    expect(await claimBroll(db, CLAIM, noop)).toBe('claimed')
    const insert = db.sql.find(s => /INSERT INTO autopilot_spend/.test(s))!
    expect(insert).toBeTruthy()
    // Existence is the guard, so the insert must not overwrite a prior claim.
    expect(insert).toMatch(/ON CONFLICT \(id\) DO NOTHING/)
    expect(insert).toMatch(/RETURNING id/)
    expect(db.params.at(-1)).toContain(BROLL_CLIP_UNITS)
  })

  it('тема уже оплачена сегодня — второй раз не платим', async () => {
    // DO NOTHING returns no row: somebody already claimed this topic today.
    const db = fakeDb([{ rows: [] }, { rows: [] }])
    expect(await claimBroll(db, CLAIM, noop)).toBe('taken')
  })

  it('база есть и молчит — отказ, а не трата вслепую', async () => {
    const db = fakeDb(() => {
      throw new Error('connection reset')
    })
    expect(await claimBroll(db, CLAIM, noop)).toBe('silent')
  })

  it('базы нет вовсе — слой работает, как и раньше', async () => {
    // The portrait module makes the same deliberate choice: without a promise
    // of durability, refusing would simply disable the feature.
    expect(await claimBroll(null, CLAIM, noop)).toBe('no-db')
  })

  it('заявка НИКОГДА не снимается — снятие означало бы повторную покупку', () => {
    // The first version released the row on an "answered refusal". That is the
    // wrong way round: the live Replicate fallback can answer {success:false}
    // AFTER the prediction was accepted, while the certainly-free failure (a
    // refused connection to our own port) throws instead.
    const src = fs.readFileSync(
      path.join(__dirname, 'src', 'broll-spend.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/DELETE FROM autopilot_spend/)
    const script = fs.readFileSync(
      path.join(__dirname, 'scripts', 'agent-autopilot.ts'),
      'utf8'
    )
    expect(script).not.toContain('releaseBroll')
  })

  it('доставка закрывает заявку', async () => {
    const upd = fakeDb([{ rows: [] }])
    await settleBroll(upd, CLAIM.id, noop)
    expect(upd.sql.join(' ')).toMatch(
      /UPDATE autopilot_spend SET state = 'delivered'/
    )
  })

  it('сбой закрытия не роняет цикл', async () => {
    const boom = fakeDb(() => {
      throw new Error('down')
    })
    await expect(settleBroll(boom, CLAIM.id, noop)).resolves.toBeUndefined()
  })

  it('цена в строке — НОЛЬ, иначе она съедает бюджет портрета', () => {
    // The table is shared and the portrait's ceiling is SUM(credits) over
    // (owner, day) with no filter, so any non-zero value here is subtracted
    // from a neighbouring paid feature's budget. Blocking is by row existence,
    // so zero costs the dedup nothing.
    expect(BROLL_CLIP_UNITS).toBe(0)
  })
})

describe('в автопилоте заявка стоит ДО платного вызова', () => {
  const SCRIPT = fs.readFileSync(
    path.join(__dirname, 'scripts', 'agent-autopilot.ts'),
    'utf8'
  )
  /** The b-roll block: from the money-decided branch to the face reel below. */
  const block = (() => {
    const start = SCRIPT.indexOf('CLAIM THE CLIP BEFORE THE MONEY MOVES')
    expect(start, 'b-roll branch not found').toBeGreaterThan(-1)
    const end = SCRIPT.indexOf('FACE REEL', start)
    return SCRIPT.slice(start, end === -1 ? start + 6000 : end)
  })()

  it('находит блок — иначе проверка пустая', () => {
    expect(block).toContain('/api/generate/video')
  })

  it('claimBroll вызывается РАНЬШЕ, чем уходит запрос к провайдеру', () => {
    const claim = block.indexOf('claimBroll(')
    const pay = block.indexOf('/api/generate/video')
    expect(claim).toBeGreaterThan(-1)
    expect(pay).toBeGreaterThan(-1)
    // A claim taken after the call is a receipt, not a guard.
    expect(claim).toBeLessThan(pay)
  })

  it('платит ТОЛЬКО claimed или no-db — прочие исходы до провайдера не доходят', () => {
    // The spend is gated by the condition itself, so the permitted outcomes are
    // enumerated in ONE place: anything that is not 'claimed'/'no-db' -- that
    // is 'taken', 'silent' and 'skip' -- cannot reach the provider at all.
    const gate = block.search(
      /brollClaim === 'claimed' \|\| brollClaim === 'no-db'/
    )
    const pay = block.indexOf('/api/generate/video')
    expect(gate, 'нет условия на исход заявки').toBeGreaterThan(-1)
    expect(gate).toBeLessThan(pay)
    // And a refusal is still explained to the log rather than silent.
    expect(SCRIPT).toMatch(/brollClaim === 'taken'/)
    expect(SCRIPT).toMatch(/brollClaim === 'silent'/)
  })
})
