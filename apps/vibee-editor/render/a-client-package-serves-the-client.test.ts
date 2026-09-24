/**
 * THE PACKAGE SERVES THE CLIENT, NOT ONLY THE CARD ABOUT THE CLIENT.
 *
 * `crm_client_profiles` holds what was measured about a person: the name he
 * is called, the name he is NOT, what is never said to him, what outranks a
 * sale. Until now it was read on one surface -- the owner's CRM workspace,
 * where he talks ABOUT somebody. On the surface where the person writes
 * HIMSELF, the package did not exist, which is why the agent called lead
 * 8420420131 "Pasha" for a week after he corrected it.
 *
 * What this pins:
 *   - the package is looked up as the OWNER, whoever is calling;
 *   - a person with no package costs nothing and says nothing in the DM;
 *   - the owner's workspace still gets told when a package is missing;
 *   - a dead table costs the package, never the answer;
 *   - the business DM is wired to read it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '144022504'
const TIM = '8420420131'

const PROFILE = {
  name: 'Тим',
  not_name: 'Паша',
  identity_rules: ['Его зовут Тим. Не Паша.'],
}

/** Remembers every SELECT the profile lookup makes, with its parameters. */
function profilePool(o: { has?: boolean; dead?: boolean } = {}) {
  const seen: Array<{ sql: string; params: unknown[] }> = []
  return {
    seen,
    query: async (sql: string, params: unknown[] = []) => {
      if (o.dead) throw new Error('no table')
      const flat = sql.replace(/\s+/g, ' ').trim()
      seen.push({ sql: flat, params })
      if (/FROM crm_client_profiles WHERE telegram_id/.test(flat))
        return {
          rows:
            o.has === false
              ? []
              : [
                  {
                    client: 'woody-weed',
                    profile: PROFILE,
                    updated_at: '2026-09-21',
                    owner_id: OWNER,
                  },
                ],
        }
      if (/FROM user_soul WHERE telegram_id/.test(flat))
        return { rows: [{ content: 'soul', updated_at: '2026-09-21' }] }
      if (/FROM user_skills WHERE telegram_id/.test(flat))
        return { rows: [{ name: 'Woody: витрина' }] }
      return { rows: [] }
    },
  }
}

beforeEach(() => {
  vi.resetModules()
  delete process.env.ZEP_API_KEY
})

describe('clientBriefBlock', () => {
  it('reads the package as the owner even when the client is the caller', async () => {
    const { clientBriefBlock } = await import('./src/agent/chat')
    const pool = profilePool()
    // The caller is Tim himself: this is the business DM.
    const ctx = { telegramId: TIM, pool } as never
    const b = await clientBriefBlock(ctx, OWNER, TIM)
    expect(b.name).toBe('woody-weed')
    expect(b.text).toContain('ПРОФИЛЬ КЛИЕНТА')
    expect(b.text).toContain('Паша')
    expect(b.text).toContain('SOUL клиента: есть')
    const look = pool.seen.find(s =>
      /FROM crm_client_profiles WHERE telegram_id/.test(s.sql)
    )!
    // Whose notes, and about whom -- in that order, and not the caller's.
    expect(look.params).toEqual([TIM, OWNER])
  })

  it('a person with no package says nothing in the DM', async () => {
    const { clientBriefBlock } = await import('./src/agent/chat')
    const b = await clientBriefBlock(
      { telegramId: '2086031075', pool: profilePool({ has: false }) } as never,
      OWNER,
      '2086031075'
    )
    expect(b).toEqual({ text: '', name: null })
  })

  it("but the owner's workspace is told the package is missing", async () => {
    const { clientBriefBlock } = await import('./src/agent/chat')
    const b = await clientBriefBlock(
      { telegramId: OWNER, pool: profilePool({ has: false }) } as never,
      OWNER,
      '2086031075',
      { sayWhenMissing: true }
    )
    expect(b.text).toContain('не настроен')
    /*
     * Since crm-reach, SOUL is read only for a person who is yours (profile
     * or reach). Here there is neither, so the brief says the private half
     * was not read -- not the false "she never wrote one".
     */
    expect(b.text).toContain('SOUL и скиллы клиента не читались')
  })

  it('a dead table costs the package, not the answer', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { clientBriefBlock } = await import('./src/agent/chat')
    const b = await clientBriefBlock(
      { telegramId: TIM, pool: profilePool({ dead: true }) } as never,
      OWNER,
      TIM
    )
    expect(b.text).toBe('')
    warn.mockRestore()
  })
})

describe('the business DM is wired to it', () => {
  it('reads the package for whoever is writing, and puts it in the prompt', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    // Read relative to this file: `vitest related` runs from the repo root.
    const src = readFileSync(join(__dirname, 'src', 'agent', 'chat.ts'), 'utf8')
    expect(src).toMatch(
      /const clientBrief =\s*\n?\s*opts\?\.surface === 'business'/
    )
    expect(src).toMatch(/dmHistory\s*\+\s*clientBrief\s*\+\s*clientContext/)
    // And the workspace block is not a second copy of the same reader.
    expect(src).toMatch(
      /const brief = await clientBriefBlock\(ctx, owner, lead/
    )
  })
})
