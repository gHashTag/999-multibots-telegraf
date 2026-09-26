import { beforeEach, describe, expect, it } from 'vitest'
import {
  AVATAR_STYLES,
  avatarPrompt,
  handleAvatars,
  makeAvatars,
  resetAvatarTableForTests,
} from './src/agent/agent-avatars'
import { MARKETPLACE_AGENTS } from '../packages/vibee-atoms/src/agent-marketplace'
import { LEAD_MAGNET_MODEL } from './src/kie-image'

/**
 * EACH AGENT WEARS THE OWNER'S FACE IN ITS OWN STYLE (owner, 2026-09-26).
 * Each case is a way it could go wrong: an agent with no style, a picture
 * made by the wrong model or without keeping the face, a stranger repainting
 * the catalogue, one failure losing the others, a paid picture not kept.
 */
const KEEPER = '900000077'
const rows = new Map<string, string>()
const pool = {
  async query(sql: string, params: unknown[] = []) {
    if (sql.startsWith('INSERT INTO agent_avatars'))
      rows.set(String(params[0]), String(params[1]))
    if (sql.startsWith('SELECT agent_id, url'))
      return {
        rows: [...rows].map(([agent_id, url]) => ({ agent_id, url })),
      }
    return { rows: [] }
  },
}
const ctx = { telegramId: KEEPER, pool } as never
const keepers = () => [KEEPER]

beforeEach(() => {
  rows.clear()
  resetAvatarTableForTests()
})

describe('the styles', () => {
  it('every catalogued agent has its own, and each keeps the face', () => {
    for (const a of MARKETPLACE_AGENTS) {
      const p = avatarPrompt(a.id)
      expect(p, a.id).toBeTruthy()
      expect(p).toContain('Keep this exact person')
      expect(p).toContain('no text')
    }
    expect(new Set(Object.values(AVATAR_STYLES)).size).toBe(
      MARKETPLACE_AGENTS.length
    )
    expect(avatarPrompt('nobody')).toBeNull()
  })
})

describe('making them', () => {
  it('GPT Image 2.5 from the owner avatar, square, each kept; one refusal loses no other', async () => {
    const asked: Array<Record<string, unknown>> = []
    const edit = async (args: Record<string, unknown>) => {
      asked.push(args)
      if (String(args.prompt).includes('FPGA'))
        return { done: false, reason: 'provider said no' }
      if (String(args.prompt).includes('timing-diagram'))
        return { done: false, pending: true, taskId: 't1' }
      return { done: true, url: `https://s3/${asked.length}.png` }
    }
    const out = (await makeAvatars({}, ctx, { edit, keepers })) as {
      made: Array<{ agent: string; state: string }>
    }
    expect(asked).toHaveLength(MARKETPLACE_AGENTS.length)
    for (const a of asked) {
      expect(a.model).toBe(LEAD_MAGNET_MODEL)
      expect(a.aspect_ratio).toBe('1:1')
      /* No image_url: the tool takes the caller's own (the owner's) avatar. */
      expect(a).not.toHaveProperty('image_url')
    }
    const state = Object.fromEntries(out.made.map(m => [m.agent, m.state]))
    expect(state.fpga).toBe('refused')
    expect(state.rtl).toBe('drawing')
    expect(state.scientist).toBe('drawn')
    expect([...rows.keys()].sort()).toEqual(
      MARKETPLACE_AGENTS.map(a => a.id)
        .filter(id => id !== 'fpga' && id !== 'rtl')
        .sort()
    )
  })

  it('a second run draws only the missing ones; redo draws them all', async () => {
    rows.set('blogger', 'https://s3/old.png')
    const drawn: string[] = []
    const edit = async (args: Record<string, unknown>) => {
      drawn.push(String(args.prompt))
      return { done: true, url: 'https://s3/new.png' }
    }
    await makeAvatars({}, ctx, { edit, keepers })
    expect(drawn).toHaveLength(MARKETPLACE_AGENTS.length - 1)
    drawn.length = 0
    await makeAvatars({ redo: true }, ctx, { edit, keepers })
    expect(drawn).toHaveLength(MARKETPLACE_AGENTS.length)
  })

  it('only a keeper repaints the catalogue, and nothing is charged otherwise', async () => {
    let called = 0
    const edit = async () => {
      called += 1
      return { done: true, url: 'x' }
    }
    const out = await makeAvatars(
      {},
      { telegramId: '900000001', pool } as never,
      { edit, keepers }
    )
    expect(out.done).toBe(false)
    expect(called).toBe(0)
  })
})

describe('reading them', () => {
  it('public GET: agent -> address, unknown agents dropped', async () => {
    rows.set('rtl', 'https://s3/rtl.png')
    rows.set('ghost', 'https://s3/ghost.png')
    const r = await handleAvatars(
      { url: '/api/agents/avatars', method: 'GET' },
      { getPool: async () => pool }
    )
    expect(r.body.avatars).toEqual({ rtl: 'https://s3/rtl.png' })
    const { isPublic } = await import('./auth')
    expect(
      isPublic({ url: '/api/agents/avatars', method: 'GET' } as never)
    ).toBe(true)
    expect(
      isPublic({ url: '/api/agents/avatars', method: 'POST' } as never)
    ).toBe(false)
  })
})
