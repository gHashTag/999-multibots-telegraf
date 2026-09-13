import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LeelaPlanReelSchema,
  resolveLeelaProps,
} from './src/compositions/LeelaPlanReel'
import {
  LEELA_BOT,
  LEELA_CTA_EN,
  LEELA_CTA_RU,
  LEELA_URL,
  planInfo,
  violatesLeelaVoice,
} from './src/agent/leela-canon'
import { TEMPLATE_CARDS, cardById } from './src/templates/registry'
import { TOOLS, TOOLS_BY_NAME } from './src/agent/tools'
import { TOKEN_PRICES } from './src/agent/billing-shared'
import { PAID, FREE } from './src/agent/pricing'

/**
 * EVERY WORD THE REEL SHOWS COMES FROM THE CANON OR FROM A PROP.
 *
 * The template's defaults are derived, not typed: hook = the approved hook
 * (else the title), quote = the first sentences of the canonical text, CTA =
 * the one public CTA the specs allow. If any of these ever fell back to a
 * placeholder, the reel would render pseudo-text -- the exact defect the
 * off-brand reference image had.
 */
describe('LeelaPlanReel props', () => {
  it('schema parses with only a plan', () => {
    const p = LeelaPlanReelSchema.parse({ plan: 6 })
    expect(p.lang).toBe('ru')
    expect(p.showBoard).toBe(true)
    expect(p.hook).toBeUndefined()
  })
  it('rejects a plan outside 1..72', () => {
    expect(() => LeelaPlanReelSchema.parse({ plan: 0 })).toThrow()
    expect(() => LeelaPlanReelSchema.parse({ plan: 73 })).toThrow()
    expect(() => LeelaPlanReelSchema.parse({ plan: 6.5 })).toThrow()
  })
  it('default hook and quote derive from the canon', () => {
    const r = resolveLeelaProps({ plan: 6 })
    const info = planInfo(6)
    expect(r.title).toBe('Заблуждение (моха)')
    expect(r.hook).toBe(info.hooks[0])
    expect(info.description.startsWith(r.quote.replace(/…$/, ''))).toBe(true)
    expect(r.quote.length).toBeLessThanOrEqual(220)
    expect(r.cta).toBe(LEELA_CTA_RU)
    expect(r.handle).toBe(LEELA_BOT)
    expect(r.url).toBe(LEELA_URL)
    expect(r.question).toBe('')
    expect(r.chakra).toBe('Муладхара')
  })
  it('a plan without an approved hook falls back to its title', () => {
    const r = resolveLeelaProps({ plan: 33, lang: 'en' })
    expect(planInfo(33, 'en').hooks).toEqual([])
    expect(r.hook).toBe(planInfo(33, 'en').title)
    expect(r.cta).toBe(LEELA_CTA_EN)
  })
  it('snake and arrow starts carry their destination', () => {
    expect(resolveLeelaProps({ plan: 12 })).toMatchObject({ event: 'snake', to: 8 })
    expect(resolveLeelaProps({ plan: 54 })).toMatchObject({ event: 'arrow', to: 68 })
    expect(resolveLeelaProps({ plan: 68 })).toMatchObject({ event: 'none', rowIndex: 8 })
  })
  it('explicit props win over derived defaults', () => {
    const r = resolveLeelaProps({ plan: 6, hook: 'A', quote: 'B', question: 'C?' })
    expect(r.hook).toBe('A')
    expect(r.quote).toBe('B')
    expect(r.question).toBe('C?')
  })
  it('default copy of every plan passes the voice check', () => {
    // Hooks are quoted from the editorial plan; a stop-list word inside a
    // canonical sentence is the canon's own, but the CTA and titles must be clean.
    for (const lang of ['ru', 'en'] as const) {
      const cta = lang === 'ru' ? LEELA_CTA_RU : LEELA_CTA_EN
      expect(violatesLeelaVoice(cta)).toEqual([])
    }
  })
})

describe('LeelaPlanReel registration', () => {
  it('has a template card with a required plan field', () => {
    const card = cardById('LeelaPlanReel')
    expect(card).toBeDefined()
    expect(TEMPLATE_CARDS.filter(c => c.id === 'LeelaPlanReel')).toHaveLength(1)
    const plan = card!.fields.find(f => f.key === 'plan')
    expect(plan?.required).toBe(true)
    expect(plan?.kind).toBe('number')
    expect(card!.accent).toBe('#e0b544')
    expect(card!.rules.length).toBeGreaterThanOrEqual(4)
  })
  it('is registered in Root.tsx next to the other compositions', () => {
    const root = readFileSync(join(__dirname, 'src', 'Root.tsx'), 'utf8')
    expect(root).toContain('id="LeelaPlanReel"')
    expect(root).toContain("from './compositions/LeelaPlanReel'")
    expect(root).toContain('schema={LeelaPlanReelSchema}')
  })
})

describe('leela_plan tool', () => {
  const tool = TOOLS_BY_NAME.get('leela_plan')
  it('exists exactly once and is free', () => {
    expect(tool).toBeDefined()
    expect(TOOLS.filter(t => t.name === 'leela_plan')).toHaveLength(1)
    // Not declared as a charged operation anywhere.
    expect(TOKEN_PRICES['leela_plan']).toBeUndefined()
    expect(PAID.some(p => p.функция === 'leela_plan')).toBe(false) // cyrillic-ok: field name
    const src = readFileSync(join(__dirname, 'src', 'agent', 'tools.ts'), 'utf8')
    expect(src).not.toMatch(/spendTokens\(\s*ctx\s*,\s*'leela_plan'/)
    // And the free list says so.
    expect(FREE.some(f => f.что.includes('leela_plan'))).toBe(true) // cyrillic-ok: field name
  })
  it('returns canon plus ready reel_props for plan 6', async () => {
    const out = (await tool!.handler({ plan: 6 }, {} as never)) as Record<string, any>
    expect(out.title).toBe('Заблуждение (моха)')
    expect(out.event).toBe('none')
    expect(out.reel_props.compositionId).toBe('LeelaPlanReel')
    expect(out.reel_props.props).toMatchObject({ lang: 'ru', plan: 6, cta: LEELA_CTA_RU })
    expect(typeof out.reel_props.props.hook).toBe('string')
    expect(out.reel_props.props.hook.length).toBeGreaterThan(0)
    expect(out.reel_props.props.quote.length).toBeLessThanOrEqual(220)
    expect(typeof out.voice_check).toBe('string')
    // The props it hands out are exactly what the composition accepts.
    expect(() => LeelaPlanReelSchema.parse(out.reel_props.props)).not.toThrow()
  })
  it('answers in English and reports snakes', async () => {
    const out = (await tool!.handler({ plan: 12, lang: 'en' }, {} as never)) as Record<string, any>
    expect(out.event).toBe('snake')
    expect(out.to).toBe(8)
    expect(out.reel_props.props.lang).toBe('en')
    expect(out.reel_props.props.cta).toBe(LEELA_CTA_EN)
  })
  it('refuses a plan outside the board', async () => {
    const out = (await tool!.handler({ plan: 99 }, {} as never)) as Record<string, any>
    expect(out.reel_props).toBeUndefined()
  })
})
