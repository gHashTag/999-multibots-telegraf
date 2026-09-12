import { describe, it, expect, beforeEach } from 'vitest'
import { leadOfTarget } from './src/agent/telegram-tools'
import {
  leadCandidates,
  forgetMemoryTableForTests,
} from './src/agent/chat-memory'
import { systemPrompt, BUTTON_MARKERS } from './src/agent/chat'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE CRM AUDIT OF 2026-09-12 (owner: "find every CRM anomaly and fix it").
 * One test per fix on the render side; the bot side is in
 * src/__tests__/services/crmProactive.audit.test.ts.
 */
const OWNER = '144022504'
const D = (s: string) => new Date(s)

beforeEach(() => forgetMemoryTableForTests())

describe('P0: the lead rides with a tg_send draft', () => {
  it('a numeric chat id is the lead; a @username is not guessed', () => {
    expect(leadOfTarget('555555')).toBe('555555')
    expect(leadOfTarget(' 144022504 ')).toBe('144022504')
    expect(leadOfTarget('@someone')).toBeUndefined()
    expect(leadOfTarget('1234')).toBeUndefined()
    expect(leadOfTarget(undefined)).toBeUndefined()
  })

  it('tg_send passes it to propose (source)', () => {
    const src = readFileSync(
      join(__dirname, 'src/agent/telegram-tools.ts'),
      'utf8'
    )
    const at = src.indexOf("'Отправка ждёт подтверждения человека.")
    expect(at).toBeGreaterThan(-1)
    expect(src.slice(at, at + 200)).toMatch(/ctx,\s*leadOfTarget\(args\.chat\)/)
  })
})

describe('P1 #6: an offer that went out cools down', () => {
  const now = D('2026-09-08T12:00:00Z')
  const pool = (lastIn: string, lastOut: string, text: string) => ({
    query: async (sql: string) => {
      const flat = sql.replace(/\s+/g, ' ')
      if (/GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: 'asked',
              total: 6,
              inbound: 3,
              last_in: lastIn,
              last_out: lastOut,
            },
          ],
        }
      if (/^SELECT lead_id, text FROM crm_messages/.test(flat))
        return { rows: [{ lead_id: 'asked', text }] }
      return { rows: [] }
    },
  })

  it('price in the history + our invoice written yesterday, nothing unanswered => wait', async () => {
    const touched = new Map([
      ['asked', { kind: 'written', at: '2026-09-07T13:00:00Z' }],
    ])
    const [l] = await leadCandidates(
      pool(
        '2026-09-07T09:00:00Z',
        '2026-09-07T13:00:00Z',
        'сколько стоит фото?'
      ),
      OWNER,
      { touched, now }
    )
    expect(l.next).toBe('wait')
  })

  it('the same person four days later is offered again; a new unanswered word is always a reply', async () => {
    const old = new Map([
      ['asked', { kind: 'written', at: '2026-09-04T09:00:00Z' }],
    ])
    const [again] = await leadCandidates(
      pool(
        '2026-09-03T09:00:00Z',
        '2026-09-04T09:00:00Z',
        'сколько стоит фото?'
      ),
      OWNER,
      { touched: old, now }
    )
    expect(['offer', 'deliver']).toContain(again.next)
    const fresh = new Map([
      ['asked', { kind: 'written', at: '2026-09-07T13:00:00Z' }],
    ])
    const [reply] = await leadCandidates(
      pool(
        '2026-09-08T09:00:00Z',
        '2026-09-07T13:00:00Z',
        'сколько стоит фото?'
      ),
      OWNER,
      { touched: fresh, now }
    )
    expect(reply.next).toBe('reply')
  })
})

describe('P1 #5: the sweep brief is not recorded by the server (source)', () => {
  it('routes.ts skips both записатьРеплику calls when tools_only is true', () => {
    const src = readFileSync(join(__dirname, 'src/agent/routes.ts'), 'utf8')
    expect(src).toMatch(/const ephemeral = body\.tools_only === true/)
    expect(src).toMatch(
      new RegExp("if \\(!ephemeral && последняя\\?\\.role === 'user'\\)")
    )
    expect(src).toMatch(new RegExp('if \\(ответ && !ephemeral\\)'))
  })
})

describe('P1 #2: who paid is scoped to the owner\u2019s bots (source)', () => {
  it('every whoPaid/платившие call carries a scope', () => {
    const dir = join(__dirname, 'src/agent')
    const tools = readFileSync(join(dir, 'crm-tools.ts'), 'utf8')
    expect(tools).toContain('type=eq.MONEY_INCOME${scopeFilter}')
    expect(tools).not.toMatch(new RegExp('платившие\\(\\)'))
    for (const f of [
      'crm-memory-tools.ts',
      'crm-summary-tool.ts',
      'crm-touch-tools.ts',
    ]) {
      const s = readFileSync(join(dir, f), 'utf8')
      expect(s, f).not.toMatch(/whoPaid\(\)/)
    }
  })
})

describe('P2 #9: a sent photo is mirrored like text (source)', () => {
  it('sendFileWithAddressBook returns the message and execute keeps it', () => {
    const src = readFileSync(
      join(__dirname, 'src/agent/tg-proposals.ts'),
      'utf8'
    )
    expect(src).toMatch(/sent = await sendFileWithAddressBook\(/)
    expect(src).toMatch(/caption: string \| undefined\n\): Promise<unknown>/)
  })
})

describe('P2 #14: the unattended sweep gets no button markers', () => {
  it('bot surface draws markers for a person, not for tools_only', () => {
    expect(systemPrompt('bot')).toContain(BUTTON_MARKERS)
    expect(systemPrompt('bot', true)).not.toContain(BUTTON_MARKERS)
    expect(systemPrompt('business')).not.toContain(BUTTON_MARKERS)
  })
})
