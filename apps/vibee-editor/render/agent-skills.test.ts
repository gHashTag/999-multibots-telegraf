import { describe, expect, it } from 'vitest'
import {
  SKILLS_BUDGET,
  agentSkillsSection,
  skillsFor,
  skillsSection,
} from './src/agent/agent-skills'
import { MARKETPLACE_AGENTS } from '../packages/vibee-atoms/src/agent-marketplace'

/**
 * EVERY SPECIALIST STARTS WITH ITS SKILLS (owner, 2026-09-24). Each case is a
 * way the connection could be wrong: an agent missing its own rules, another
 * agent's rules (or the Leela editorial drafts) leaking in, a prompt blown up
 * by one long skill, or a turn failing because the table is not there yet.
 */

const rows = [
  {
    name: 'Работа: как отвечать рекрутёрам',
    content: 'Коротко, с вилкой и стеком.',
  }, // cyrillic-ok: the owner's own words
  { name: 'Blogger: hashtags', content: '3-6 concrete tags' },
  { name: 'Тон рилсов', content: 'Без жаргона, числа с единицами.' }, // cyrillic-ok
  { name: 'Leela: draft 1', content: 'private editorial draft' },
  { name: 'хабр: формат', content: 'Шаги воспроизведения обязательны.' }, // cyrillic-ok
]

describe("which skills are an agent's", () => {
  it("its own by prefix, then the general ones; never another agent's", () => {
    const job = skillsFor(rows, 'job')
    expect(job.own.map(r => r.name)).toEqual([
      'Работа: как отвечать рекрутёрам',
    ]) // cyrillic-ok
    expect(job.general.map(r => r.name)).toEqual(['Тон рилсов']) // cyrillic-ok
    const blogger = skillsFor(rows, 'blogger')
    expect(blogger.own.map(r => r.name)).toEqual(['Blogger: hashtags'])
    expect(blogger.general.map(r => r.name)).not.toContain('хабр: формат') // cyrillic-ok
  })

  it('prefixes are matched in any case, and a Leela draft reaches no agent', () => {
    expect(skillsFor(rows, 'habr').own.map(r => r.name)).toEqual([
      'хабр: формат',
    ]) // cyrillic-ok
    for (const a of MARKETPLACE_AGENTS) {
      const s = skillsFor(rows, a.id)
      expect(
        [...s.own, ...s.general].map(r => r.name),
        a.id
      ).not.toContain('Leela: draft 1')
    }
  })

  it('every catalogued agent has at least one prefix of its own', () => {
    for (const a of MARKETPLACE_AGENTS)
      expect(a.skillPrefixes.length, a.id).toBeGreaterThan(0)
  })
})

describe('the section the specialist carries', () => {
  it('own first, general after, and nothing when there is nothing', () => {
    const t = skillsSection(skillsFor(rows, 'job'))
    expect(t.indexOf('Работа:')).toBeLessThan(t.indexOf('Тон рилсов')) // cyrillic-ok
    expect(skillsSection({ own: [], general: [] })).toBe('')
  })

  it('stays within its budget whatever the skills weigh', () => {
    const heavy = Array.from({ length: 30 }, (_, i) => ({
      name: `Работа: rule ${i}`, // cyrillic-ok
      content: 'x'.repeat(5_000),
    }))
    const t = skillsSection(skillsFor(heavy, 'job'))
    expect(t.length).toBeLessThan(SKILLS_BUDGET + 300)
    expect(t).toContain('…')
  })

  it("reads the caller's own skills, and a missing table is no section, not a failed turn", async () => {
    const asked: unknown[][] = []
    const pool = {
      async query(_sql: string, params: unknown[] = []) {
        asked.push(params)
        return { rows }
      },
    }
    const t = await agentSkillsSection(pool, '144022504', 'job')
    expect(t).toContain('Работа: как отвечать рекрутёрам') // cyrillic-ok
    expect(asked[0][0]).toBe('144022504')
    expect(t).toContain('«Работа: …»') // cyrillic-ok: the naming line
    const broken = {
      async query() {
        throw new Error('relation "user_skills" does not exist')
      },
    }
    const down = await agentSkillsSection(broken, '1', 'job')
    expect(down).not.toContain('ТВОИ НАВЫКИ') // cyrillic-ok: the section header
    expect(down).toContain('«Работа: …»') // cyrillic-ok: the naming line stays
    await expect(agentSkillsSection(pool, '1', 'nonexistent')).resolves.toBe('')
    await expect(agentSkillsSection(pool, '1', undefined)).resolves.toBe('')
  })

  it('every specialist is told to file a remembered rule under its own prefix', async () => {
    const { agentSkillName, agentSkills } = await import(
      '../packages/vibee-atoms/src/agent-marketplace'
    )
    for (const a of MARKETPLACE_AGENTS) {
      const line = await agentSkillsSection(null, '1', a.id)
      const ru = agentSkillName(a.id, 'ru', 'x')!.split(':')[0]
      const en = agentSkillName(a.id, 'en', 'x')!.split(':')[0]
      expect(line, a.id).toContain(`«${ru}: …»`)
      expect(line, a.id).toContain(`«${en}: …»`)
      /* The name it is told to use really files the rule under this agent. */
      expect(agentSkills([{ name: `${ru}: x` }], a.id).own).toHaveLength(1)
    }
  })
})

describe('a rule written in the agent’s own chat', () => {
  it('gets a name that files it under that agent, in either language', async () => {
    const { agentSkillName, agentSkills, SKILL_NAME_MAX } = await import(
      '../packages/vibee-atoms/src/agent-marketplace'
    )
    for (const a of MARKETPLACE_AGENTS)
      for (const lang of ['ru', 'en'] as const) {
        const name = agentSkillName(a.id, lang, 'answer briefly, with numbers')
        expect(name, `${a.id}/${lang}`).toBeTruthy()
        const filed = agentSkills([{ name: name! }], a.id)
        expect(
          filed.own.map(r => r.name),
          `${a.id}/${lang}`
        ).toEqual([name])
        for (const other of MARKETPLACE_AGENTS.filter(o => o.id !== a.id))
          expect(
            agentSkills([{ name: name! }], other.id).general,
            `${a.id} leaks into ${other.id}`
          ).toEqual([])
        expect(name!.length).toBeLessThanOrEqual(SKILL_NAME_MAX)
      }
  })

  it('the prefix is the person’s language, and a long rule is cut on a word', async () => {
    const { agentSkillName } = await import(
      '../packages/vibee-atoms/src/agent-marketplace'
    )
    expect(agentSkillName('job', 'ru', 'отвечать коротко')).toBe(
      'Работа: отвечать коротко'
    ) // cyrillic-ok
    expect(agentSkillName('job', 'en', 'reply briefly')).toBe(
      'Job: reply briefly'
    )
    const long = agentSkillName('blogger', 'en', 'word '.repeat(40))!
    expect(long.endsWith('word…')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(8 + 60)
    /* A colon in the rule would move the prefix; it is not kept in the name. */
    expect(agentSkillName('job', 'en', 'Blogger: steal the rule')).toBe(
      'Job: Blogger steal the rule'
    )
  })

  it('nothing to name: an empty rule or an unknown agent', async () => {
    const { agentSkillName } = await import(
      '../packages/vibee-atoms/src/agent-marketplace'
    )
    expect(agentSkillName('job', 'ru', '   ')).toBeNull()
    expect(agentSkillName('nobody', 'ru', 'x')).toBeNull()
  })
})
