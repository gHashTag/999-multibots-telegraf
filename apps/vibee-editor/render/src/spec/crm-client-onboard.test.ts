/**
 * Spec crm-client-onboard.t27, every test block run against the compiled
 * logic AND the host's tool (crm_client_onboard) with a Postgres double --
 * the owner's 2026-10-09 client thread replayed: a seller fills the thread's
 * client's SOUL without naming her id, and nothing lands in the seller's own
 * skills.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SPEC from './crm-client-onboard.gen'
import {
  dossierFits,
  intoClientAccount,
  leadFrom,
  mayOnboard,
  nextStep,
} from './crm-client-onboard.logic'

const gate = vi.hoisted(() => ({
  sellers: new Set<string>(),
  leads: new Set<string>(),
}))
vi.mock('../agent/telegram-tools', async orig => ({
  ...((await orig()) as object),
  isSeller: async (ctx: { telegramId?: string }) =>
    gate.sellers.has(String(ctx?.telegramId)),
}))
vi.mock('../agent/crm-reach', async orig => ({
  ...((await orig()) as object),
  ownsLead: async (_ctx: unknown, lead: string) => gate.leads.has(lead),
}))

const SELLER = '900000010'
const CLIENT = '900000011'
const OTHER = '900000012'

function profiles(avatar = '') {
  const rows = new Map<string, { client: string; profile: unknown }>()
  const queries: string[] = []
  const pool = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(sql)
      if (/SELECT client, profile FROM crm_client_profiles/.test(sql)) {
        const r = rows.get(`${params[0]}:${params[1]}`)
        return { rows: r ? [{ ...r }] : [] }
      }
      if (/INSERT INTO crm_client_profiles/.test(sql)) {
        const [lead, owner, client, json] = params as string[]
        rows.set(`${owner}:${lead}`, { client, profile: JSON.parse(json) })
        return { rows: [] }
      }
      if (/SELECT avatar_url FROM crm_people/.test(sql))
        return { rows: avatar ? [{ avatar_url: avatar }] : [] }
      return { rows: [] }
    },
  }
  return { pool, rows, queries }
}

async function onboard(
  args: Record<string, unknown>,
  ctx: Record<string, unknown>
) {
  const { CRM_ONBOARD_TOOLS } = await import('../agent/crm-client-onboard')
  return (await CRM_ONBOARD_TOOLS[0].handler(args, ctx as never)) as Record<
    string,
    any
  >
}

beforeEach(() => {
  gate.sellers = new Set([SELLER])
  gate.leads = new Set([CLIENT])
  vi.stubEnv('OWNER_TELEGRAM_ID', '900000099')
})
afterEach(() => vi.unstubAllEnvs())

describe('spec crm-client-onboard.t27 against the host', () => {
  it('a seller onboards her own lead; a stranger and a seller of another lead do not', async () => {
    expect(mayOnboard(false, true, true)).toBe(true)
    expect(mayOnboard(false, true, false)).toBe(false)
    expect(mayOnboard(false, false, true)).toBe(false)
    expect(mayOnboard(true, false, false)).toBe(true)
    const db = profiles()
    const mine = await onboard(
      { soul: 'Мягкий тон.' },
      { telegramId: SELLER, pool: db.pool, faceOf: CLIENT }
    )
    expect(mine.done).toBe(true)
    const theirs = await onboard(
      { telegram_id: OTHER, soul: 'x' },
      { telegramId: SELLER, pool: db.pool }
    )
    expect(theirs).toEqual({ done: false, reason: expect.any(String) })
    expect(db.rows.has(`${SELLER}:${OTHER}`)).toBe(false)
    gate.sellers = new Set()
    const stranger = await onboard(
      { soul: 'x' },
      { telegramId: OTHER, pool: db.pool, faceOf: CLIENT }
    )
    expect(stranger.done).toBe(false)
  })

  it("the client's own account is written only by the platform owner for a connected client", async () => {
    expect(intoClientAccount(true, true)).toBe(true)
    expect(intoClientAccount(true, false)).toBe(false)
    expect(intoClientAccount(false, true)).toBe(false)
    expect(intoClientAccount(false, false)).toBe(false)
    // The seller's dossier never touches the client's own rows.
    const db = profiles()
    await onboard(
      { soul: 'Мягкий тон.', skills: [{ name: 'Тон', content: 'коротко' }] },
      { telegramId: SELLER, pool: db.pool, faceOf: CLIENT }
    )
    expect(db.queries.some(q => /user_soul|user_skills/.test(q))).toBe(false)
    // SETUP_REFUSAL_NAMES_ONBOARD: the installer names the seller's door.
    const { CRM_CLIENT_TOOLS, SETUP_IS_THE_OWNERS } = await import(
      '../agent/crm-client-setup-tool'
    )
    const setup = CRM_CLIENT_TOOLS.find(t => t.name === 'crm_client_setup')!
    const r = await setup.handler({ client: 'example', telegram_id: CLIENT }, {
      telegramId: SELLER,
      pool: db.pool,
    } as never)
    expect(r).toEqual({ done: false, reason: SETUP_IS_THE_OWNERS })
    expect(SETUP_IS_THE_OWNERS).toContain(SPEC.TOOL)
    expect(SPEC.SETUP_REFUSAL_NAMES_ONBOARD).toBe(true)
  })

  it("the client is the one named, else the thread's, else nobody", async () => {
    expect(leadFrom(true, true)).toBe(1)
    expect(leadFrom(true, false)).toBe(1)
    expect(leadFrom(false, true)).toBe(2)
    expect(leadFrom(false, false)).toBe(0)
    const db = profiles()
    const r = await onboard(
      { name: 'Anna' },
      { telegramId: SELLER, pool: db.pool, faceOf: CLIENT }
    )
    expect(r.telegram_id).toBe(CLIENT)
    const none = await onboard(
      { name: 'Anna' },
      { telegramId: SELLER, pool: db.pool }
    )
    expect(none.done).toBe(false)
    // CONTEXT_NAMES_LEAD_ID: the thread's header carries the id (chat.ts).
    expect(SPEC.CONTEXT_NAMES_LEAD_ID).toBe(true)
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const chat = readFileSync(join(__dirname, '..', 'agent', 'chat.ts'), 'utf8')
    expect(chat).toContain('Разговор о клиенте ${name} (telegram_id ${lead})')
  })

  it('the next step is the first one missing', async () => {
    expect(nextStep(false, true, true, true)).toBe(0)
    expect(nextStep(true, false, true, true)).toBe(1)
    expect(nextStep(true, true, false, true)).toBe(2)
    expect(nextStep(true, true, true, false)).toBe(3)
    expect(nextStep(true, true, true, true)).toBe(SPEC.STEP_COUNT)
    const { NEXT_STEP_SAID } = await import('../agent/crm-client-onboard')
    expect(NEXT_STEP_SAID).toHaveLength(SPEC.STEP_COUNT + 1)
    const db = profiles()
    const ctx = { telegramId: SELLER, pool: db.pool, faceOf: CLIENT }
    let r = await onboard({ name: 'Anna' }, ctx)
    expect(r.next).toBe(NEXT_STEP_SAID[1])
    r = await onboard({ soul: 'Мягкий тон.' }, ctx)
    expect(r.next).toBe(NEXT_STEP_SAID[2])
    r = await onboard({ skills: [{ name: 'Тон', content: 'коротко' }] }, ctx)
    expect(r.next).toBe(NEXT_STEP_SAID[3])
    const withFace = profiles('https://x/avatar.png')
    r = await onboard(
      {
        name: 'Anna',
        soul: 's',
        skills: [{ name: 'Тон', content: 'коротко' }],
      },
      { ...ctx, pool: withFace.pool }
    )
    expect(r.next).toBe(NEXT_STEP_SAID[4])
    // Each call keeps what the last one wrote.
    expect(db.rows.get(`${SELLER}:${CLIENT}`)?.profile).toMatchObject({
      name: 'Anna',
      soul: 'Мягкий тон.',
      skills: [{ name: 'Тон', content: 'коротко' }],
    })
  })

  it('a dossier fits its bounds', async () => {
    expect(dossierFits(32000, 24, 8000)).toBe(true)
    expect(dossierFits(32001, 1, 10)).toBe(false)
    expect(dossierFits(10, 25, 10)).toBe(false)
    expect(dossierFits(10, 1, 8001)).toBe(false)
    expect(SPEC.SKILLS_CREATE_IS_CALLERS_OWN).toBe(true)
    expect(SPEC.SETUP_REFUSAL_NAMES_ONBOARD).toBe(true)
    const db = profiles()
    const ctx = { telegramId: SELLER, pool: db.pool, faceOf: CLIENT }
    const big = await onboard(
      { soul: 'x'.repeat(SPEC.SOUL_MAX_CHARS + 1) },
      ctx
    )
    expect(big.done).toBe(false)
    const many = await onboard(
      {
        skills: Array.from({ length: SPEC.SKILLS_MAX + 1 }, (_, i) => ({
          name: `s${i}`,
          content: 'c',
        })),
      },
      ctx
    )
    expect(many.done).toBe(false)
    expect(db.rows.size).toBe(0)
  })

  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })
})
