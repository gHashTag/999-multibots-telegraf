import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { systemPrompt, BUTTON_MARKERS } from './src/agent/chat.ts'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/**
 * THE AGENT MAY PROPOSE A BUTTON — IN THE BOT, AND NOWHERE ELSE.
 *
 * The owner asked that answers always arrive with something to press. The bot
 * has rendered `[[Label|act:id]]` markers for a while, but nothing told the
 * AGENT the syntax exists: the only prompt that knew it was the bot's FALLBACK,
 * the tool-less model used when this agent is unreachable. Buttons were offered
 * by the degraded path and not by the good one.
 *
 * The surface gate is the load-bearing part. The same agent answers the mini
 * app, which renders text as text — a marker there reaches the person as
 * literal bracket soup. The route already validates the surface against an
 * allowlist; it just never handed it to the agent.
 */
describe('the marker rule is bound to the surface that can render it', () => {
  it('is present for the bot', () => {
    const p = systemPrompt('bot')
    expect(p).toContain('[[Подпись|act:id]]')
    expect(p).toContain('topup')
    expect(p).toContain('balance')
  })

  it('is absent for the mini app, which would show it as text', () => {
    const p = systemPrompt('miniapp')
    expect(p).not.toContain('[[Подпись|act:id]]')
    expect(p).not.toContain('act:id')
  })

  /** Absent surface means "not the bot" — the safe direction is no markers. */
  it('is absent when no surface is given at all', () => {
    expect(systemPrompt()).not.toContain('[[Подпись|act:id]]')
    expect(systemPrompt('agent')).not.toContain('[[Подпись|act:id]]')
    expect(systemPrompt('ios')).not.toContain('[[Подпись|act:id]]')
  })

  it('changes nothing else: the two prompts differ only by the rule', () => {
    const withRule = systemPrompt('bot')
    /* The mini app carries its own rule now (cards); both are cut out. */
    const app = systemPrompt('miniapp')
    // Built with new RegExp so the Russian anchors sit inside a string literal:
    // in a regex literal they read as code to the Cyrillic gate.
    /*
     * Anchored on the exported constant, not on its last words. It used to
     * end at the literal "без тебя." -- the old sentence "the bot adds the
     * standard buttons without you" -- and when the owner reversed that rule
     * on 24.09.2026 this stopped matching the rule it exists to find. The
     * constant is what the prompt is built from, so the constant is the
     * anchor; the assertion below still proves the rule is IN the bot prompt
     * and out of the mini app's.
     */
    const rule = new RegExp(
      BUTTON_MARKERS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    const cards = new RegExp('\\n\\nКАРТОЧКИ[\\s\\S]*?ради украшения\\.')
    expect(withRule).toMatch(rule)
    expect(app).toMatch(cards)
    expect(withRule.replace(rule, '')).toBe(app.replace(cards, ''))
  })
})

describe('cards to approve, only where they are drawn (the mini app)', () => {
  it('the mini app is told the card syntax and what an approval sounds like', () => {
    const p = systemPrompt('miniapp')
    expect(p).toContain('[[card: ')
    expect(p).toContain('✅ Одобряю: ') // cyrillic-ok: the player's own words
    expect(p).toContain('✖ Не надо: ') // cyrillic-ok: the player's own words
  })

  it('no other surface, and never the unattended sweep, gets it', () => {
    for (const s of ['bot', 'business', 'ios', 'agent', 'queen', undefined])
      expect(systemPrompt(s as string | undefined)).not.toContain('[[card: ')
    expect(systemPrompt('miniapp', true)).not.toContain('[[card: ')
  })
})

describe('the route hands the surface to the agent', () => {
  const ROUTES = fs.readFileSync(
    path.join(__dirname, 'src', 'agent', 'routes.ts'),
    'utf8'
  )

  /*
   * Structural, because the chat route needs a database and a live model to
   * run — but the property is exactly the wiring: the surface was parsed and
   * allow-listed in this file long before this change and went nowhere.
   */
  it('passes the validated surface into runAgent, not the raw body field', () => {
    const call = sliceFrom(ROUTES, 'runAgent(')
    const head = call.slice(0, 400)
    expect(head).toContain('surface:')
    expect(head).not.toContain('body.surface')
  })
})
