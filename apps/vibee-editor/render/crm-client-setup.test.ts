/**
 * The client package for @playom installs into the rows the app already
 * reads -- and never over her own words.
 */
import { describe, it, expect } from 'vitest'
import {
  loadClientPackage,
  setupClient,
  clientProfileFor,
  skillNameFromMarkdown,
  REEL_SERIES,
  REEL_GOAL_TITLE,
  SKILL_PREFIX,
  CRM_CLIENT_TOOLS,
} from './src/agent/crm-client-setup-tool'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
const CLIENT = '435572800'

/** A tiny Postgres double: enough SQL shape to exercise the setup paths. */
function fakePool(seed: {
  soul?: string
  skills?: Record<string, string>
  goal?: boolean
  items?: string[]
  /** Pre-existing profile rows: [owner_id | null, profile json]. */
  profiles?: Array<{ owner: string | null; profile: string }>
  /** Whether the legacy PRIMARY KEY (telegram_id) still exists. */
  legacyPkey?: boolean
}) {
  const state = {
    soul: seed.soul,
    skills: { ...(seed.skills ?? {}) },
    goal: seed.goal ?? false,
    items: [...(seed.items ?? [])],
    profiles: [...(seed.profiles ?? [])],
    legacyPkey: seed.legacyPkey ?? false,
    writes: [] as string[],
    ddl: [] as string[],
  }
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      const q = sql.replace(/\s+/g, ' ').trim()
      if (/^SELECT 1 FROM pg_constraint/.test(q)) return { rows: state.legacyPkey ? [{}] : [] }
      if (/^ALTER TABLE crm_client_profiles DROP CONSTRAINT/.test(q)) {
        state.legacyPkey = false
        state.ddl.push('drop-pkey')
        return { rows: [] }
      }
      if (/^CREATE|^ALTER/.test(q)) {
        state.ddl.push(q.split(' ').slice(0, 3).join(' '))
        return { rows: [] }
      }
      if (/^UPDATE crm_client_profiles p SET owner_id = \(SELECT owner_id FROM crm_people/.test(q)) {
        state.ddl.push('backfill')
        return { rows: [] }
      }
      if (/^UPDATE crm_client_profiles SET owner_id = \$2 WHERE telegram_id = \$1 AND owner_id IS NULL/.test(q)) {
        for (const r of state.profiles) if (r.owner === null) r.owner = String(params[1])
        return { rows: [] }
      }
      if (/^SELECT content FROM user_soul/.test(q))
        return { rows: state.soul ? [{ content: state.soul }] : [] }
      if (/^SELECT content, updated_at::text FROM user_soul/.test(q))
        return { rows: state.soul ? [{ content: state.soul, updated_at: 't' }] : [] }
      if (/^INSERT INTO user_soul/.test(q)) {
        state.soul = String(params[1])
        state.writes.push('soul')
        return { rows: [] }
      }
      if (/^SELECT content FROM user_skills/.test(q)) {
        const c = state.skills[String(params[1])]
        return { rows: c ? [{ content: c }] : [] }
      }
      if (/^SELECT name FROM user_skills/.test(q))
        return { rows: Object.keys(state.skills).map(name => ({ name })) }
      if (/^INSERT INTO user_skills/.test(q)) {
        state.skills[String(params[1])] = String(params[2])
        state.writes.push('skill')
        return { rows: [] }
      }
      if (/^UPDATE user_skills/.test(q)) {
        state.skills[String(params[1])] = String(params[2])
        state.writes.push('skill-update')
        return { rows: [] }
      }
      if (/^INSERT INTO crm_client_profiles/.test(q)) {
        const owner = String(params[1])
        const mine = state.profiles.find(r => r.owner === owner)
        if (mine) mine.profile = String(params[3])
        else state.profiles.push({ owner, profile: String(params[3]) })
        state.writes.push('profile')
        return { rows: [] }
      }
      if (/^SELECT client, profile, updated_at::text, owner_id FROM crm_client_profiles WHERE telegram_id = \$1 AND \(owner_id = \$2 OR owner_id IS NULL\)/.test(q)) {
        const caller = String(params[1])
        const visible = state.profiles
          .filter(r => r.owner === null || r.owner === caller)
          .sort((a, b) => (a.owner === null ? 1 : 0) - (b.owner === null ? 1 : 0))
        return {
          rows: visible.slice(0, 1).map(r => ({
            client: 'playom',
            profile: JSON.parse(r.profile),
            updated_at: 't',
            owner_id: r.owner,
          })),
        }
      }
      if (/^SELECT id FROM content_plan_goals/.test(q))
        return { rows: state.goal ? [{ id: 7 }] : [] }
      if (/^INSERT INTO content_plan_goals/.test(q)) {
        state.goal = true
        state.writes.push('goal')
        return { rows: [{ id: 7 }] }
      }
      if (/^SELECT title FROM content_plan_items/.test(q))
        return { rows: state.items.map(title => ({ title })) }
      if (/^INSERT INTO content_plan_items/.test(q)) {
        state.items.push(String(params[2]))
        state.writes.push('item')
        return { rows: [] }
      }
      throw new Error(`unexpected sql: ${q.slice(0, 60)}`)
    },
  }
  return { pool, state }
}

const ctxWith = (pool: unknown) =>
  ({ telegramId: OWNER, pool }) as unknown as ToolContext

describe('the playom client package', () => {
  it('bundles a draft SOUL, a structured profile and three Leela-prefixed skills', () => {
    const pkg = loadClientPackage('playom')
    expect(pkg.soul).toContain('Статус: ЧЕРНОВИК')
    expect(pkg.soul).toContain('Здесь нет правильного ответа')
    expect(pkg.profile.telegram_id).toBe(CLIENT)
    for (const k of [
      'business',
      'audience_hypotheses',
      'discovery_questions',
      'content_series',
      'reel_template',
      'forbidden_claims',
      'approved_cta',
      'visual_tokens',
    ])
      expect(pkg.profile).toHaveProperty(k)
    expect((pkg.profile as any).reel_template.composition).toBe('LeelaPlanReel')
    expect(pkg.skills.length).toBe(3)
    for (const s of pkg.skills) {
      expect(s.name.startsWith(SKILL_PREFIX)).toBe(true)
      expect(s.content.length).toBeGreaterThan(400)
    }
    expect(skillNameFromMarkdown('# Leela: x\nbody', 'f')).toBe('Leela: x')
    expect(skillNameFromMarkdown('# y\nbody', 'f')).toBe('Leela: y')
    expect(skillNameFromMarkdown('no heading', 'fallback')).toBe('Leela: fallback')
  })

  it('the SOUL, the skills and the profile carry no prices, superlatives or pressure words', () => {
    const pkg = loadClientPackage('playom')
    const texts = [pkg.soul, ...pkg.skills.map(s => s.content)]
    // The stop-list is quoted inside the texts as a rule; a claim would use them
    // outside quotes. Check the claim shapes the honesty rules forbid.
    for (const t of texts) {
      expect(t).not.toMatch(/\d+\s*(⭐|звёзд|Stars|XTR)/i) // cyrillic-ok
      expect(t).not.toMatch(/\bмы\s+(первые|единственные|лучшие)\b/i) // cyrillic-ok
      expect(t).not.toMatch(/гарантир/i) // cyrillic-ok
    }
    expect(REEL_SERIES.length).toBe(12)
    expect(REEL_SERIES.filter(r => r.plan != null).every(r => r.plan! >= 1 && r.plan! <= 72)).toBe(true)
  })

  it('installs everything on a fresh account and reports each row', async () => {
    const { pool, state } = fakePool({})
    const r = await setupClient(ctxWith(pool), {
      client: 'playom',
      telegramId: CLIENT,
      overwriteSoul: false,
      overwriteSkills: false,
      withPlan: true,
      dryRun: false,
    })
    expect(r.soul).toBe('created')
    expect(r.skills.map(s => s.result)).toEqual(['created', 'created', 'created'])
    expect(r.plan).toEqual({ goal: 'created', items_added: 12 })
    expect(state.writes.filter(w => w === 'item').length).toBe(12)
    expect(state.profiles).toEqual([{ owner: OWNER, profile: expect.any(String) }])
    const seen = await clientProfileFor(ctxWith(pool), CLIENT)
    expect(seen.has_profile).toBe(true)
    expect(seen.owner_id).toBe(OWNER)
    expect(seen.owned_by_caller).toBe(true)
    expect(seen.has_soul).toBe(true)
    expect(seen.soul_is_draft).toBe(true)
    expect((seen.skills as string[]).length).toBe(3)
  })

  it('keeps her own SOUL, holds a changed skill as a conflict, adds only missing plan items', async () => {
    const pkg = loadClientPackage('playom')
    const { pool, state } = fakePool({
      soul: 'Мой собственный текст.',
      skills: { [pkg.skills[0].name]: 'её версия', [pkg.skills[1].name]: pkg.skills[1].content },
      goal: true,
      items: [REEL_SERIES[0].title, REEL_SERIES[1].title],
    })
    const r = await setupClient(ctxWith(pool), {
      client: 'playom',
      telegramId: CLIENT,
      overwriteSoul: false,
      overwriteSkills: false,
      withPlan: true,
      dryRun: false,
    })
    expect(r.soul).toBe('kept_hers')
    expect(state.soul).toBe('Мой собственный текст.')
    expect(r.skills.map(s => s.result)).toEqual(['conflict', 'identical', 'created'])
    expect(state.skills[pkg.skills[0].name]).toBe('её версия')
    expect(r.plan).toEqual({ goal: 'exists', items_added: 10 })
    expect(REEL_GOAL_TITLE.startsWith(SKILL_PREFIX)).toBe(true)
  })

  it('dry_run writes nothing but reports the same plan', async () => {
    const { pool, state } = fakePool({})
    const r = await setupClient(ctxWith(pool), {
      client: 'playom',
      telegramId: CLIENT,
      overwriteSoul: true,
      overwriteSkills: true,
      withPlan: true,
      dryRun: true,
    })
    expect(r.dry_run).toBe(true)
    expect(r.soul).toBe('created')
    expect(r.plan.items_added).toBe(12)
    expect(state.writes).toEqual([])
  })

  // Spec: t27 specs/automation/crm-client-ownership.t27 (#3608)
  it('the profile belongs to the seller who set it up: another seller does not see it and may hold their own', async () => {
    const { pool, state } = fakePool({})
    const setup = (who: string) =>
      setupClient({ telegramId: who, pool } as unknown as ToolContext, {
        client: 'playom',
        telegramId: CLIENT,
        overwriteSoul: false,
        overwriteSkills: false,
        withPlan: false,
        dryRun: false,
      })
    await setup(OWNER)
    const other = { telegramId: '500000001', pool } as unknown as ToolContext
    const strangerView = await clientProfileFor(other, CLIENT)
    expect(strangerView.has_profile).toBe(false)
    await setup('500000001')
    expect(state.profiles.map(r => r.owner).sort()).toEqual([OWNER, '500000001'].sort())
    const mine = await clientProfileFor(ctxWith(pool), CLIENT)
    expect(mine.owner_id).toBe(OWNER)
    const theirs = await clientProfileFor(other, CLIENT)
    expect(theirs.owner_id).toBe('500000001')
  })

  it('a legacy row without an owner is readable by any seller and is claimed by the next setup', async () => {
    const pkg = loadClientPackage('playom')
    const { pool, state } = fakePool({
      profiles: [{ owner: null, profile: JSON.stringify(pkg.profile) }],
      legacyPkey: true,
    })
    const other = { telegramId: '500000001', pool } as unknown as ToolContext
    const before = await clientProfileFor(other, CLIENT)
    expect(before.has_profile).toBe(true)
    expect(before.owner_id).toBeNull()
    expect(before.owned_by_caller).toBe(false)
    // The migration ran once: the legacy key is gone, the unique index and the backfill were issued.
    expect(state.ddl).toContain('drop-pkey')
    expect(state.ddl).toContain('CREATE UNIQUE INDEX')
    expect(state.ddl).toContain('backfill')
    await setupClient(ctxWith(pool), {
      client: 'playom',
      telegramId: CLIENT,
      overwriteSoul: false,
      overwriteSkills: false,
      withPlan: false,
      dryRun: false,
    })
    // Claimed, not duplicated: one row, now owned.
    expect(state.profiles).toHaveLength(1)
    expect(state.profiles[0].owner).toBe(OWNER)
    const after = await clientProfileFor(other, CLIENT)
    expect(after.has_profile).toBe(false)
    // Running the migration again drops nothing twice.
    const ddlBefore = state.ddl.length
    await clientProfileFor(ctxWith(pool), CLIENT)
    expect(state.ddl.slice(ddlBefore)).not.toContain('drop-pkey')
  })

  it('an unknown package is refused by name', () => {
    expect(() => loadClientPackage('../etc')).toThrow()
    expect(() => loadClientPackage('nobody')).toThrow()
  })

  it('the tools exist: setup is owner-only, the profile reader needs a seller', async () => {
    const setup = CRM_CLIENT_TOOLS.find(t => t.name === 'crm_client_setup')!
    const read = CRM_CLIENT_TOOLS.find(t => t.name === 'crm_client_profile')!
    expect(setup).toBeTruthy()
    expect(read).toBeTruthy()
    const stranger = { telegramId: '1', pool: {} } as unknown as ToolContext
    await expect(setup.handler({}, stranger)).rejects.toThrow()
    await expect(read.handler({}, undefined as never)).rejects.toThrow()
    const bad = await setup.handler(
      { telegram_id: 'abc' },
      { telegramId: OWNER, pool: {} } as unknown as ToolContext
    )
    expect((bad as any).done).toBe(false)
  })
})
