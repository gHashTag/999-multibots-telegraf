/**
 * A client package installs into the rows the app already reads -- and never
 * over the client's own words.
 *
 * Every package here is fictional. Real packages live in the render's
 * database (crm_client_packages, #2712); the repository bundles one synthetic
 * example, `clients/example`, with an invented id.
 */
import { describe, it, expect } from 'vitest'
import {
  loadClientPackage,
  bundledPackageNames,
  packageSlug,
  planFor,
  profileForPrompt,
  setupClient,
  clientProfileFor,
  skillNameFromMarkdown,
  REEL_SERIES,
  REEL_GOAL_TITLE,
  SKILL_PREFIX,
  LEELA_TEMPLATE,
  CRM_CLIENT_TOOLS,
  schemaCheck,
} from './src/agent/crm-client-setup-tool'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
/** The id the bundled example package names -- invented. */
const CLIENT = '900000001'
const OTHER_SELLER = '900000002'
const EXAMPLE = 'example'

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
      if (/^SELECT 1 FROM pg_constraint/.test(q))
        return { rows: state.legacyPkey ? [{}] : [] }
      if (/^ALTER TABLE crm_client_profiles DROP CONSTRAINT/.test(q)) {
        state.legacyPkey = false
        state.ddl.push('drop-pkey')
        return { rows: [] }
      }
      if (/^CREATE|^ALTER/.test(q)) {
        state.ddl.push(q.split(' ').slice(0, 3).join(' '))
        return { rows: [] }
      }
      // No uploaded packages in this double: the bundled example is used.
      if (
        /^SELECT client, telegram_id, profile, soul, skills FROM crm_client_packages WHERE owner_id = \$1 AND client = \$2/.test(
          q
        )
      )
        return { rows: [] }
      if (
        /^UPDATE crm_client_profiles p SET owner_id = \(SELECT owner_id FROM crm_people/.test(
          q
        )
      ) {
        state.ddl.push('backfill')
        return { rows: [] }
      }
      if (
        /^UPDATE crm_client_profiles SET owner_id = \$2 WHERE telegram_id = \$1 AND owner_id IS NULL/.test(
          q
        )
      ) {
        for (const r of state.profiles)
          if (r.owner === null) r.owner = String(params[1])
        return { rows: [] }
      }
      if (/^SELECT content FROM user_soul/.test(q))
        return { rows: state.soul ? [{ content: state.soul }] : [] }
      if (/^SELECT content, updated_at::text FROM user_soul/.test(q))
        return {
          rows: state.soul ? [{ content: state.soul, updated_at: 't' }] : [],
        }
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
      if (
        /^SELECT client, profile, updated_at::text, owner_id FROM crm_client_profiles WHERE telegram_id = \$1 AND \(owner_id = \$2 OR owner_id IS NULL\)/.test(
          q
        )
      ) {
        const caller = String(params[1])
        const visible = state.profiles
          .filter(r => r.owner === null || r.owner === caller)
          .sort(
            (a, b) => (a.owner === null ? 1 : 0) - (b.owner === null ? 1 : 0)
          )
        return {
          rows: visible.slice(0, 1).map(r => ({
            client: EXAMPLE,
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

const setupOf = (over: Partial<Parameters<typeof setupClient>[1]> = {}) => ({
  client: EXAMPLE,
  telegramId: CLIENT,
  overwriteSoul: false,
  overwriteSkills: false,
  withPlan: true,
  dryRun: false,
  ...over,
})

describe('the bundled example package', () => {
  it('is the only package in the repository, and it is synthetic', () => {
    expect(bundledPackageNames()).toEqual([EXAMPLE])
    const pkg = loadClientPackage(EXAMPLE)
    expect(pkg.profile.telegram_id).toBe(CLIENT)
    expect(pkg.profile.status).toBe('example')
  })

  it('bundles a draft SOUL, a structured profile and prefixed skills', () => {
    const pkg = loadClientPackage(EXAMPLE)
    expect(pkg.soul).toContain('Статус: ЧЕРНОВИК') // cyrillic-ok
    for (const k of [
      'business',
      'audience_hypotheses',
      'discovery_questions',
      'forbidden',
      'approved_cta',
      'content_plan',
    ])
      expect(pkg.profile).toHaveProperty(k)
    expect(pkg.skills.length).toBe(2)
    for (const s of pkg.skills) {
      expect(s.name.startsWith('Example: ')).toBe(true)
      expect(s.name).not.toContain(SKILL_PREFIX)
      expect(s.content.length).toBeGreaterThan(200)
    }
    expect(skillNameFromMarkdown('# Leela: x\nbody', 'f')).toBe('Leela: x')
    expect(skillNameFromMarkdown('# y\nbody', 'f')).toBe('Leela: y')
    expect(skillNameFromMarkdown('no heading', 'fallback')).toBe(
      'Leela: fallback'
    )
  })

  it('the SOUL and the skills carry no prices, superlatives or pressure words', () => {
    const pkg = loadClientPackage(EXAMPLE)
    const texts = [pkg.soul, ...pkg.skills.map(s => s.content)]
    for (const t of texts) {
      expect(t).not.toMatch(/\d+\s*(⭐|звёзд|Stars|XTR)/i) // cyrillic-ok
      expect(t).not.toMatch(/\bмы\s+(первые|единственные|лучшие)\b/i) // cyrillic-ok
      expect(t).not.toMatch(/гарантир|guarantee/i) // cyrillic-ok
    }
    expect(REEL_SERIES.length).toBe(12)
    expect(
      REEL_SERIES.filter(r => r.plan != null).every(
        r => r.plan! >= 1 && r.plan! <= 72
      )
    ).toBe(true)
  })

  it('installs everything on a fresh account and reports each row', async () => {
    const { pool, state } = fakePool({})
    const r = await setupClient(ctxWith(pool), setupOf())
    expect(r.soul).toBe('created')
    expect(r.skills.map(s => s.result)).toEqual(['created', 'created'])
    expect(r.plan).toEqual({ goal: 'created', items_added: 3 })
    expect(state.writes.filter(w => w === 'item').length).toBe(3)
    expect(state.profiles).toEqual([
      { owner: OWNER, profile: expect.any(String) },
    ])
    const seen = await clientProfileFor(ctxWith(pool), CLIENT)
    expect(seen.has_profile).toBe(true)
    expect(seen.owner_id).toBe(OWNER)
    expect(seen.owned_by_caller).toBe(true)
    expect(seen.has_soul).toBe(true)
    expect(seen.soul_is_draft).toBe(true)
    expect((seen.skills as string[]).length).toBe(2)
  })

  it('keeps the client’s own SOUL, holds a changed skill as a conflict, adds only missing plan items', async () => {
    const pkg = loadClientPackage(EXAMPLE)
    const plan = planFor(pkg)!
    const { pool, state } = fakePool({
      soul: 'My own words.',
      skills: { [pkg.skills[0].name]: 'their own version' },
      goal: true,
      items: [plan.items[0].title],
    })
    const r = await setupClient(ctxWith(pool), setupOf())
    expect(r.soul).toBe('kept_hers')
    expect(state.soul).toBe('My own words.')
    expect(r.skills.map(s => s.result)).toEqual(['conflict', 'created'])
    expect(state.skills[pkg.skills[0].name]).toBe('their own version')
    expect(r.plan).toEqual({ goal: 'exists', items_added: 2 })
  })

  it('an identical skill is left alone', async () => {
    const pkg = loadClientPackage(EXAMPLE)
    const { pool } = fakePool({
      skills: { [pkg.skills[1].name]: pkg.skills[1].content },
    })
    const r = await setupClient(ctxWith(pool), setupOf({ withPlan: false }))
    expect(r.skills.map(s => s.result)).toEqual(['created', 'identical'])
  })

  it('dry_run writes nothing but reports the same plan', async () => {
    const { pool, state } = fakePool({})
    const r = await setupClient(
      ctxWith(pool),
      setupOf({ overwriteSoul: true, overwriteSkills: true, dryRun: true })
    )
    expect(r.dry_run).toBe(true)
    expect(r.soul).toBe('created')
    expect(r.plan.items_added).toBe(3)
    expect(state.writes).toEqual([])
  })

  // Spec: t27 specs/automation/crm-client-ownership.t27 (#3608)
  it('the profile belongs to the seller who set it up: another seller does not see it and may hold their own', async () => {
    const { pool, state } = fakePool({})
    const setup = (who: string) =>
      setupClient(
        { telegramId: who, pool } as unknown as ToolContext,
        setupOf({ withPlan: false })
      )
    await setup(OWNER)
    const other = { telegramId: OTHER_SELLER, pool } as unknown as ToolContext
    const strangerView = await clientProfileFor(other, CLIENT)
    expect(strangerView.has_profile).toBe(false)
    await setup(OTHER_SELLER)
    expect(state.profiles.map(r => r.owner).sort()).toEqual(
      [OWNER, OTHER_SELLER].sort()
    )
    const mine = await clientProfileFor(ctxWith(pool), CLIENT)
    expect(mine.owner_id).toBe(OWNER)
    const theirs = await clientProfileFor(other, CLIENT)
    expect(theirs.owner_id).toBe(OTHER_SELLER)
  })

  it('a legacy row without an owner is readable by any seller and is claimed by the next setup', async () => {
    const pkg = loadClientPackage(EXAMPLE)
    const { pool, state } = fakePool({
      profiles: [{ owner: null, profile: JSON.stringify(pkg.profile) }],
      legacyPkey: true,
    })
    const other = { telegramId: OTHER_SELLER, pool } as unknown as ToolContext
    const before = await clientProfileFor(other, CLIENT)
    expect(before.has_profile).toBe(true)
    expect(before.owner_id).toBeNull()
    expect(before.owned_by_caller).toBe(false)
    // The migration ran once: the legacy key is gone, the unique index and the backfill were issued.
    expect(state.ddl).toContain('drop-pkey')
    expect(state.ddl).toContain('CREATE UNIQUE INDEX')
    expect(state.ddl).toContain('backfill')
    await setupClient(ctxWith(pool), setupOf({ withPlan: false }))
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

  it('an unknown package is refused by name, and a path is never cleaned into a name', async () => {
    expect(() => loadClientPackage('../etc')).toThrow()
    expect(() => loadClientPackage('nobody')).toThrow()
    expect(packageSlug('../example')).toBe('')
    expect(packageSlug(' example ')).toBe(EXAMPLE)
    expect(packageSlug(42)).toBe('')
    const { pool } = fakePool({})
    await expect(
      setupClient(ctxWith(pool), setupOf({ client: 'nobody' }))
    ).rejects.toThrow('crm_client_package_upload')
  })

  it('writes only the seller’s own notes when the client has no account', async () => {
    const { pool, state } = fakePool({})
    const report = await setupClient(
      ctxWith(pool),
      setupOf({ profileOnly: true })
    )
    expect(report.profile_only).toBe(true)
    expect(report.soul).toBe('not_connected')
    expect(report.skills).toEqual([])
    expect(report.plan.items_added).toBe(0)
    expect(state.soul).toBeUndefined()
    expect(Object.keys(state.skills)).toEqual([])
    expect(state.profiles).toHaveLength(1)
    expect(JSON.parse(state.profiles[0].profile).name).toBe('Alex')
  })

  it('the tools exist: setup is owner-only, the profile reader needs a seller', async () => {
    const setup = CRM_CLIENT_TOOLS.find(t => t.name === 'crm_client_setup')!
    const read = CRM_CLIENT_TOOLS.find(t => t.name === 'crm_client_profile')!
    expect(setup).toBeTruthy()
    expect(read).toBeTruthy()
    const stranger = { telegramId: '1', pool: {} } as unknown as ToolContext
    await expect(setup.handler({}, stranger)).rejects.toThrow()
    await expect(read.handler({}, undefined as never)).rejects.toThrow()
    const bad = await setup.handler({ telegram_id: 'abc', client: EXAMPLE }, {
      telegramId: OWNER,
      pool: {},
    } as unknown as ToolContext)
    expect((bad as any).done).toBe(false)
  })
})

/*
 * THE PLAN BELONGS TO THE PACKAGE.
 *
 * A package with its own plan gets its own; a package whose reel template is
 * the Leela one gets the Leela series; a package with neither gets none --
 * never somebody else's.
 */
describe('planFor', () => {
  it('a package’s own plan wins, and never borrows the Leela series', () => {
    const plan = planFor(loadClientPackage(EXAMPLE))!
    expect(plan.goal).not.toBe(REEL_GOAL_TITLE)
    expect(plan.templateId).toBe(null)
    expect(plan.items.length).toBe(3)
    for (const it of plan.items)
      expect(REEL_SERIES.some(r => r.title === it.title)).toBe(false)
  })

  it('the Leela series is the plan of a package whose template is the Leela one', () => {
    const leela = {
      client: 'any-name',
      soul: '',
      profile: { reel_template: { composition: LEELA_TEMPLATE } },
      skills: [],
    }
    const plan = planFor(leela)!
    expect(plan.goal).toBe(REEL_GOAL_TITLE)
    expect(plan.templateId).toBe(LEELA_TEMPLATE)
    expect(plan.items).toHaveLength(REEL_SERIES.length)
  })

  it('gives no plan to a package that declares none', () => {
    const bare = { client: 'someone-else', soul: '', profile: {}, skills: [] }
    expect(planFor(bare)).toBe(null)
    const otherTemplate = {
      ...bare,
      profile: { reel_template: { composition: 'SomethingElse' } },
    }
    expect(planFor(otherTemplate)).toBe(null)
  })
})

/*
 * THE PROMPT USED TO CUT THE RULES OFF FIRST.
 *
 * A profile reaches the model as JSON under a character budget, and the
 * budget was a blind slice: what actually arrived was invalid JSON ending
 * mid-sentence, and the parts that never arrived were the ones at the end --
 * how to work with the client, and what never to say. The profile below is
 * fictional and shaped like the real ones.
 */
describe('profileForPrompt', () => {
  const FICTIONAL = {
    telegram_id: '900000003',
    handle: '@fictional_client',
    business: { product: 'x'.repeat(1500) },
    content_plan: { goal: 'g', items: [{ title: 'y'.repeat(800) }] },
    name: 'Robin',
    not_name: 'Bobby',
    identity_rules: ['The client is called Robin. Never Bobby.'],
    how_to_work_with_them: ['One question per message.'.repeat(20)],
    forbidden: ['Prices the client did not state'],
    open_money_question: { what: 'an unsettled refund', rule: 'offer nothing' },
  }

  it('keeps the name and the rules when the profile does not fit', () => {
    const full = profileForPrompt(FICTIONAL, 100_000)
    expect(JSON.parse(full).name).toBe('Robin')
    expect(full).not.toContain('не влезло') // cyrillic-ok

    const tight = profileForPrompt(FICTIONAL, 1200)
    const [body] = tight.split('\n')
    const parsed = JSON.parse(body)
    expect(parsed.name).toBe('Robin')
    expect(parsed.not_name).toBe('Bobby')
    expect(Array.isArray(parsed.identity_rules)).toBe(true)
    expect(Array.isArray(parsed.forbidden)).toBe(true)
    expect(body.length).toBeLessThanOrEqual(1200)
    // What did not fit is named, not silently lost.
    expect(tight).toContain('crm_client_profile')
    expect(tight).toMatch(/content_plan/)
  })

  it('what may not be said outranks what should be said', () => {
    // A budget too small for the package: the money question still makes it,
    // and the manner does not -- a polite upsell is worse than a terse answer.
    const parsed = JSON.parse(profileForPrompt(FICTIONAL, 400).split('\n')[0])
    expect(parsed.name).toBe('Robin')
    expect(Array.isArray(parsed.forbidden)).toBe(true)
    expect(parsed.open_money_question).toBeTruthy()
    expect(parsed.how_to_work_with_them).toBeUndefined()
  })

  it('the how-to key is matched by prefix, so a pronoun does not demote it', () => {
    expect(
      profileForPrompt({ how_to_work_with_her: ['x'], zzz: 'y' }, 40)
    ).toContain('how_to_work_with_her')
  })
})

describe('the schema witness', () => {
  it('the schema witness reads the base without migrating it', async () => {
    const seen: string[] = []
    const witness = (seed: {
      pkey: boolean
      index: boolean
      col: boolean
      rows: Array<string | null>
    }) => ({
      async query(sql: string) {
        const q = sql.replace(/\s+/g, ' ').trim()
        seen.push(q.split(' ')[0])
        if (/information_schema\.tables/.test(q)) return { rows: [{ ok: 1 }] }
        if (/information_schema\.columns/.test(q))
          return { rows: seed.col ? [{ ok: 1 }] : [] }
        if (/pg_constraint/.test(q))
          return { rows: seed.pkey ? [{ ok: 1 }] : [] }
        if (/pg_indexes/.test(q))
          return {
            rows: seed.index
              ? [
                  {
                    indexdef:
                      'CREATE UNIQUE INDEX crm_client_profiles_owner_client ON public.crm_client_profiles USING btree (owner_id, telegram_id)',
                  },
                ]
              : [],
          }
        if (/GROUP BY owner_id/.test(q)) {
          const m = new Map<string, number>()
          for (const o of seed.rows) if (o) m.set(o, (m.get(o) ?? 0) + 1)
          return {
            rows: [...m].map(([owner_id, rows]) => ({ owner_id, rows })),
          }
        }
        if (/count\(\*\)/.test(q))
          return {
            rows: [
              {
                total: seed.rows.length,
                owned: seed.rows.filter(Boolean).length,
              },
            ],
          }
        throw new Error('unexpected query: ' + q)
      },
    })
    const migrated = await schemaCheck({
      telegramId: OWNER,
      pool: witness({
        pkey: false,
        index: true,
        col: true,
        rows: [OWNER, OWNER, null, '7'],
      }),
    } as unknown as ToolContext)
    expect(migrated).toMatchObject({
      table_exists: true,
      owner_column: true,
      legacy_pkey: false,
      unique_index: true,
      rows_total: 4,
      rows_owned: 3,
      rows_unowned: 1,
      migrated: true,
    })
    expect(migrated.owners).toEqual([
      { owner_id: OWNER, rows: 2 },
      { owner_id: '7', rows: 1 },
    ])
    // A witness that migrates is not a witness: only SELECTs went to the base.
    expect(new Set(seen)).toEqual(new Set(['SELECT']))

    const legacy = await schemaCheck({
      telegramId: OWNER,
      pool: witness({
        pkey: true,
        index: false,
        col: false,
        rows: [null, null],
      }),
    } as unknown as ToolContext)
    expect(legacy).toMatchObject({
      owner_column: false,
      legacy_pkey: true,
      unique_index: false,
      rows_total: 2,
      rows_unowned: 2,
      owners: [],
      migrated: false,
    })
  })

  it('crm_schema_check is owner-only and takes no arguments', async () => {
    const tool = CRM_CLIENT_TOOLS.find(t => t.name === 'crm_schema_check')!
    expect(tool).toBeTruthy()
    expect(Object.keys((tool.parameters as any).properties)).toEqual([])
    await expect(
      tool.handler({}, { telegramId: '1', pool: {} } as unknown as ToolContext)
    ).rejects.toThrow()
    const absent = await tool.handler({}, {
      telegramId: OWNER,
      pool: {
        async query() {
          return { rows: [] }
        },
      },
    } as unknown as ToolContext)
    expect(absent).toMatchObject({
      table_exists: false,
      migrated: false,
      rows_total: 0,
    })
  })
})
