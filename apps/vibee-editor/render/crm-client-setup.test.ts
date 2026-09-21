/**
 * The client package for @playom installs into the rows the app already
 * reads -- and never over her own words.
 */
import { describe, it, expect } from 'vitest'
import {
  loadClientPackage,
  planFor,
  profileForPrompt,
  setupClient,
  clientProfileFor,
  skillNameFromMarkdown,
  REEL_SERIES,
  REEL_GOAL_TITLE,
  SKILL_PREFIX,
  CRM_CLIENT_TOOLS,
  schemaCheck,
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
    expect(skillNameFromMarkdown('no heading', 'fallback')).toBe(
      'Leela: fallback'
    )
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
    expect(
      REEL_SERIES.filter(r => r.plan != null).every(
        r => r.plan! >= 1 && r.plan! <= 72
      )
    ).toBe(true)
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
    expect(r.skills.map(s => s.result)).toEqual([
      'created',
      'created',
      'created',
    ])
    expect(r.plan).toEqual({ goal: 'created', items_added: 12 })
    expect(state.writes.filter(w => w === 'item').length).toBe(12)
    expect(state.profiles).toEqual([
      { owner: OWNER, profile: expect.any(String) },
    ])
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
      skills: {
        [pkg.skills[0].name]: 'её версия',
        [pkg.skills[1].name]: pkg.skills[1].content,
      },
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
    expect(r.skills.map(s => s.result)).toEqual([
      'conflict',
      'identical',
      'created',
    ])
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
    expect(state.profiles.map(r => r.owner).sort()).toEqual(
      [OWNER, '500000001'].sort()
    )
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
    const bad = await setup.handler({ telegram_id: 'abc' }, {
      telegramId: OWNER,
      pool: {},
    } as unknown as ToolContext)
    expect((bad as any).done).toBe(false)
  })

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

/*
 * THE SECOND PACKAGE IS THE ONE THAT PROVES THE FIRST WAS A PACKAGE.
 *
 * Everything the installer hard-coded -- the `Leela: ` skill prefix, the twelve
 * reels, the goal title -- was invisible while one client existed. A cannabis
 * shop on Ko Phangan reveals them: it must not inherit a board game's content
 * plan, and its skills must not be filed under somebody else's product.
 */
describe('the woody-weed client package', () => {
  it('carries its own prefix, its own plan, and never Leela’s', () => {
    const pkg = loadClientPackage('woody-weed')
    expect(pkg.profile.telegram_id).toBe('8420420131')
    expect(pkg.profile.name).toBe('Тим') // cyrillic-ok
    expect(pkg.skills.length).toBeGreaterThanOrEqual(2)
    for (const s of pkg.skills) {
      expect(s.name.startsWith('Woody: ')).toBe(true)
      expect(s.name).not.toContain(SKILL_PREFIX)
    }
    const plan = planFor(pkg)!
    expect(plan.goal).not.toBe(REEL_GOAL_TITLE)
    expect(plan.templateId).toBe(null)
    expect(plan.items.length).toBeGreaterThan(0)
    for (const it of plan.items)
      expect(REEL_SERIES.some(r => r.title === it.title)).toBe(false)
  })

  /*
   * HIS NAME IS THE DEFECT THIS PACKAGE EXISTS FOR. The agent called him by
   * another man's name for a week; he corrected it, and the very next message
   * used the wrong name again. The name has to come from a row, not from
   * whatever scrolled past in the feed.
   */
  it('states the name he was not called, so the agent cannot drift back to it', () => {
    const pkg = loadClientPackage('woody-weed')
    expect(pkg.profile.not_name).toBe('Паша') // cyrillic-ok
    const first = pkg.skills.find(s => /первый ответ/i.test(s.name))! // cyrillic-ok
    expect(first.content).toContain('Тим') // cyrillic-ok
    // An emergency outranks the upsell that was actually sent during one.
    expect(first.content).toMatch(/401/)
    expect(first.content).toMatch(/токен/i) // cyrillic-ok
  })

  it('the two stops he has not named stay empty', () => {
    const pkg = loadClientPackage('woody-weed')
    const stops = (pkg.profile as any).open_work.quest.stops
    expect(stops).toHaveLength(5)
    expect(stops.filter((s: any) => s.name === null)).toHaveLength(2)
    expect(stops[0].name).toBe('AuditLoc')
    expect(stops[4].name).toBe('Гравитюнс') // cyrillic-ok
  })

  /*
   * A PACKAGE WITH NO PLAN OF ITS OWN GETS NONE -- not Leela's. The fallback
   * is the one package the constants have always meant.
   */
  it('gives no plan to a package that declares none', () => {
    const bare = {
      client: 'someone-else',
      soul: '',
      profile: {},
      skills: [],
    }
    expect(planFor(bare)).toBe(null)
    expect(planFor(loadClientPackage('playom'))!.goal).toBe(REEL_GOAL_TITLE)
  })

  /*
   * A CLIENT WHO NEVER OPENED THE APP STILL GETS A DOSSIER. The old gate
   * refused the whole install, so the one client the agent knew nothing about
   * was precisely the one it could learn nothing about.
   */
  it('writes only the seller’s own notes when the client has no account', async () => {
    const { pool, state } = fakePool({})
    const report = await setupClient(ctxWith(pool), {
      client: 'woody-weed',
      telegramId: '8420420131',
      overwriteSoul: false,
      overwriteSkills: false,
      withPlan: true,
      dryRun: false,
      profileOnly: true,
    })
    expect(report.profile_only).toBe(true)
    expect(report.soul).toBe('not_connected')
    expect(report.skills).toEqual([])
    expect(report.plan.items_added).toBe(0)
    expect(state.soul).toBeUndefined()
    expect(Object.keys(state.skills)).toEqual([])
    expect(state.profiles).toHaveLength(1)
    expect(JSON.parse(state.profiles[0].profile).name).toBe('Тим') // cyrillic-ok
  })

  /*
   * THE PROMPT USED TO CUT THE RULES OFF FIRST.
   *
   * A profile reaches the model as JSON under a character budget, and the
   * budget was a blind slice at 3000 -- then foreignText clipped the result
   * again at its own default of 2000. Both real packages are larger than
   * either number, so what actually arrived was invalid JSON ending
   * mid-sentence, and the parts that never arrived were the ones at the end:
   * how to work with him, and what never to say.
   */
  it('keeps the name and the rules when the profile does not fit', () => {
    const pkg = loadClientPackage('woody-weed')
    const p = pkg.profile as Record<string, unknown>
    const full = profileForPrompt(p, 100_000)
    expect(JSON.parse(full).name).toBe('Тим') // cyrillic-ok
    expect(full).not.toContain('не влезло') // cyrillic-ok

    const tight = profileForPrompt(p, 1200)
    const [body] = tight.split('\n')
    const parsed = JSON.parse(body)
    expect(parsed.name).toBe('Тим') // cyrillic-ok
    expect(parsed.not_name).toBe('Паша') // cyrillic-ok
    expect(Array.isArray(parsed.identity_rules)).toBe(true)
    expect(Array.isArray(parsed.forbidden)).toBe(true)
    expect(body.length).toBeLessThanOrEqual(1200)
    // What did not fit is named, not silently lost.
    expect(tight).toContain('crm_client_profile')
    expect(tight).toMatch(/content_plan/)
  })
})

/*
 * THE THIRD PACKAGE: THE CLIENT WHO PAID AND WAITED.
 *
 * Lead 2086031075 bought a bot eighteen months ago, says she has seen no
 * revenue since, and on 2026-09-20 was greeted by the agent as a stranger --
 * "hello, I am your personal assistant" -- in the second year of the
 * correspondence. Her package exists to make two things impossible: starting
 * that conversation over, and offering her something to buy while she is still
 * owed an answer about the money she already paid.
 */
describe('the neuro-lena client package', () => {
  it('carries her name, her own prefix, and a plan built from her own words', () => {
    const pkg = loadClientPackage('neuro-lena')
    expect(pkg.profile.telegram_id).toBe('2086031075')
    expect(pkg.profile.name).toBe('Лена') // cyrillic-ok
    expect(pkg.soul).not.toBe('')
    for (const s of pkg.skills) {
      expect(s.name.startsWith('Лена: ')).toBe(true) // cyrillic-ok
      expect(s.name).not.toContain(SKILL_PREFIX)
    }
    const plan = planFor(pkg)!
    expect(plan.goal).not.toBe(REEL_GOAL_TITLE)
    expect(plan.items.length).toBeGreaterThan(0)
    for (const it of plan.items)
      expect(REEL_SERIES.some(r => r.title === it.title)).toBe(false)
  })

  it('the whole package fits the real budget, rules and all', () => {
    const p = loadClientPackage('neuro-lena').profile as Record<string, unknown>
    const out = profileForPrompt(p, 6000)
    expect(out).not.toContain('не влезло') // cyrillic-ok
    const parsed = JSON.parse(out)
    expect(parsed.name).toBe('Лена') // cyrillic-ok
    expect(Array.isArray(parsed.how_to_work_with_her)).toBe(true)
    // `how_to_work_with_her`, not `_him`: the priority list matches the prefix,
    // so a package does not lose its manner over a pronoun.
    expect(
      profileForPrompt({ how_to_work_with_her: ['x'], zzz: 'y' }, 40)
    ).toContain('how_to_work_with_her')
  })

  it('what may not be said outranks what should be said', () => {
    const p = loadClientPackage('neuro-lena').profile as Record<string, unknown>
    // A budget too small for the package: the money question still makes it,
    // and the manner does not -- a polite upsell is worse than a terse answer.
    const parsed = JSON.parse(profileForPrompt(p, 2000).split('\n')[0])
    expect(parsed.name).toBe('Лена') // cyrillic-ok
    expect(Array.isArray(parsed.forbidden)).toBe(true)
    expect(parsed.open_money_question).toBeTruthy()
    // Whose question it is: not the agent's to close.
    expect(JSON.stringify(parsed.open_money_question)).toContain('Дмитрий') // cyrillic-ok
  })

  it('her first-answer skill forbids starting the acquaintance over', () => {
    const first = loadClientPackage('neuro-lena').skills.find(
      s => /первый ответ/i.test(s.name) // cyrillic-ok
    )!
    expect(first.content).toContain('2086031075')
    expect(first.content).toMatch(/Здравствуйте/) // cyrillic-ok
    expect(first.content).toMatch(/crm_owed/)
  })
})
