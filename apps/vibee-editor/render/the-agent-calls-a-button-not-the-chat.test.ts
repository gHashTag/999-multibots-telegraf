/**
 * 2026-09-22: on a Google page with "Skip" and "Save" the agent wrote
 * paragraphs and stood still. The prompt now names a button for every
 * moment the agent waits on the person, and the tools behind them exist.
 */
import { describe, it, expect } from 'vitest'
import { systemPrompt } from './src/agent/chat'
import { BROWSER_TOOLS } from './src/browser/agent-tools'

describe('the agent knows which button to call', () => {
  const prompt = systemPrompt('miniapp')

  it('names each moment and its tool', () => {
    for (const bit of [
      'browser_ask_input kind=password',
      'kind=choice с options', // cyrillic-ok: prompt copy
      'kind=action',
      'browser_ask_permission',
    ])
      expect(prompt).toContain(bit)
  })

  it('never lets a secret travel through the chat or browser_type', () => {
    expect(prompt).toMatch(
      /пароли НЕ спрашивай\s+в чате и не набирай browser_type/
    ) // cyrillic-ok: prompt copy
  })

  it('every tool the rule names is in the registry, with the kinds it names', () => {
    const ask = BROWSER_TOOLS.find(t => t.name === 'browser_ask_input')
    expect(ask).toBeTruthy()
    const kinds = (
      ask!.parameters as { properties: { kind: { enum: string[] } } }
    ).properties.kind.enum
    for (const k of ['password', 'code', 'email', 'choice', 'action'])
      expect(kinds).toContain(k)
    expect(BROWSER_TOOLS.some(t => t.name === 'browser_ask_permission')).toBe(
      true
    )
  })
})

describe('signing in, case by case (owner: "pull the button and get in")', () => {
  const prompt = systemPrompt('miniapp')
  it('presses by label, and names every case of a sign-in', () => {
    expect(prompt).toContain('browser_click text="Google"')
    for (const bit of [
      'choice',
      'kind=action',
      'browser_ask_input',
      'cookies',
      'browser_status',
    ])
      expect(prompt).toContain(bit)
  })
  it('browser_click really takes a label', () => {
    const click = BROWSER_TOOLS.find(t => t.name === 'browser_click')!
    expect(
      (click.parameters as { properties: Record<string, unknown> }).properties
        .text
    ).toBeTruthy()
  })
})
