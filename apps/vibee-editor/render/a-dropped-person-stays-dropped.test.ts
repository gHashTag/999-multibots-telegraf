/**
 * "УДАЛИТЬ ИЗ CRM" MEANS GONE, AND STAYING GONE.
 *
 * Owner, 2026-09-23. The CRM fills itself from his correspondence, so it
 * holds couriers, support bots and strangers, and they compete for the top of
 * the list the sweep reads. Deleting the cache alone would not hold: the next
 * ingest reads Telegram and writes the same person straight back, so the
 * button would last until the following hour.
 *
 * Fictional ids only (9000000xx).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  dropLead,
  restoreLead,
  droppedOf,
  isDropped,
  DROPPED_TABLE,
  DROPPED_LIST,
  CRM_DROP_TOOLS,
} from './src/agent/crm-drop-tool'
import { rememberMessagesFresh, leadCandidates } from './src/agent/chat-memory'

const OWNER = '900000094'
const LEAD = '900000095'
const KEPT = '900000096'

/** A pool double that stores what the module actually writes. */
function fakePool() {
  const dropped = new Map<string, { active: boolean; since: string }>()
  const messages: Array<{ owner: string; lead: string; msgId: number }> = []
  const seen: string[] = []
  return {
    dropped,
    messages,
    seen,
    async query(sql: string, params: unknown[] = []) {
      seen.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40))
      const [a, b] = params.map(String)
      if (/CREATE TABLE/.test(sql)) return { rows: [] }
      if (sql === DROPPED_LIST)
        return {
          rows: [...dropped.entries()]
            .filter(([k, v]) => k.startsWith(`${a}:`) && v.active)
            .map(([k, v]) => ({ lead_id: k.split(':')[1], since: v.since })),
        }
      if (/SELECT 1 FROM crm_dropped/.test(sql))
        return { rows: dropped.get(`${a}:${b}`)?.active ? [{ '?': 1 }] : [] }
      if (/INSERT INTO crm_dropped/.test(sql)) {
        dropped.set(`${a}:${b}`, { active: true, since: 'now' })
        return { rows: [] }
      }
      if (/UPDATE crm_dropped/.test(sql)) {
        const row = dropped.get(`${a}:${b}`)
        if (!row?.active) return { rows: [] }
        row.active = false
        return { rows: [{ lead_id: b }] }
      }
      if (/DELETE FROM crm_messages/.test(sql)) {
        const before = messages.length
        for (let i = messages.length - 1; i >= 0; i--)
          if (messages[i].owner === a && messages[i].lead === b)
            messages.splice(i, 1)
        return { rows: [], rowCount: before - messages.length }
      }
      if (/DELETE FROM/.test(sql)) return { rows: [], rowCount: 0 }
      if (/INSERT INTO crm_messages/.test(sql)) {
        // Params come in sixes: owner, lead, msgId, at, out, text.
        const out: any[] = []
        for (let i = 0; i < params.length; i += 6) {
          const row = {
            owner: String(params[i]),
            lead: String(params[i + 1]),
            msgId: Number(params[i + 2]),
          }
          messages.push(row)
          out.push({ msg_id: row.msgId })
        }
        return { rows: out }
      }
      // The seller gate's one read: a connected account for this caller.
      if (/tg_sessions/.test(sql))
        return { rows: [{ telegram_id: a, session: 'a-connected-account' }] }
      // Everything leadCandidates reads beyond the messages.
      if (/FROM crm_messages/.test(sql)) {
        const mine = messages.filter(m => m.owner === a)
        if (/GROUP BY lead_id/.test(sql))
          return {
            rows: [...new Set(mine.map(m => m.lead))].map(lead => ({
              lead_id: lead,
              total: 1,
              inbound: 1,
              last_in: new Date(),
              last_out: null,
            })),
          }
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
}

let pool: ReturnType<typeof fakePool>
beforeEach(() => {
  pool = fakePool()
})

const store = (lead: string, msgId: number) =>
  rememberMessagesFresh(pool as never, OWNER, lead, [
    { msgId, at: new Date(), out: false, text: 'привет' } as never, // cyrillic-ok: a message
  ])

describe('a drop', () => {
  it('marks the person and deletes the cached correspondence', async () => {
    await store(LEAD, 1)
    expect(pool.messages).toHaveLength(1)

    const r = await dropLead(pool as never, OWNER, LEAD)
    expect(r.dropped).toBe(true)
    expect(r.removed.crm_messages).toBe(1)
    expect(pool.messages).toHaveLength(0)
    expect([...(await droppedOf(pool as never, OWNER)).keys()]).toEqual([LEAD])
  })

  it('keeps them out of the next ingest — the whole point of the mark', async () => {
    await dropLead(pool as never, OWNER, LEAD)
    expect(await store(LEAD, 2)).toEqual([])
    expect(pool.messages).toHaveLength(0)
    // Everybody else is stored exactly as before.
    expect(await store(KEPT, 3)).toHaveLength(1)
  })

  it('takes them out of the list the sweep picks from', async () => {
    await store(KEPT, 4)
    await store(LEAD, 5)
    await dropLead(pool as never, OWNER, LEAD)
    // Even if a row slipped back in during an outage, the list hides them.
    pool.messages.push({ owner: OWNER, lead: LEAD, msgId: 6 })
    const list = await leadCandidates(pool as never, OWNER, { limit: 10 })
    expect(list.map(c => c.lead)).toEqual([KEPT])
  })

  it('touches no money table', async () => {
    await dropLead(pool as never, OWNER, LEAD)
    const money = pool.seen.filter(s => /payments|user_tokens|star_/.test(s))
    expect(money).toEqual([])
  })
})

describe('the way back', () => {
  it('lifts the mark, and the correspondence returns with the next ingest', async () => {
    await dropLead(pool as never, OWNER, LEAD)
    expect(await restoreLead(pool as never, OWNER, LEAD)).toBe(true)
    expect(await isDropped(pool as never, OWNER, LEAD)).toBe(false)
    expect(await store(LEAD, 7)).toHaveLength(1)
  })

  it('says plainly when there was nothing to restore', async () => {
    expect(await restoreLead(pool as never, OWNER, LEAD)).toBe(false)
  })
})

describe('the tool', () => {
  const tool = CRM_DROP_TOOLS[0]
  const ctx = (id: string) => ({ telegramId: id, pool, isSeller: true })

  it('refuses anything that is not a numeric id', async () => {
    await expect(
      tool.handler({ lead: '@someone' }, ctx(OWNER) as never)
    ).rejects.toThrow(/\u0442\u043e\u043b\u044c\u043a\u043e/) // the tool refuses a non-numeric id
  })

  it('refuses to drop the owner themselves', async () => {
    await expect(
      tool.handler({ lead: OWNER }, ctx(OWNER) as never)
    ).rejects.toThrow(/\u0441\u0435\u0431\u044f/) // the tool refuses the owner's own id
  })

  it('is one owner, one CRM: the mark is keyed by both', async () => {
    await dropLead(pool as never, OWNER, LEAD)
    expect(await isDropped(pool as never, '900000097', LEAD)).toBe(false)
  })
})
