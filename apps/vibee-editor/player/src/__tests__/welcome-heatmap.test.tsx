/**
 * THE WELCOME SCREEN COUNTS ITS OWN STEPS (its heatmap).
 *
 * The owner decides what to change on this screen from crm_traffic: how many
 * saw it, how many left at once, which package got pressed. That only works
 * while every button actually reports -- a refactor that drops an onClick
 * would quietly read as "nobody presses it". These tests press the buttons
 * and read what was reported.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WELCOME_STEPS } from '../../../packages/vibee-atoms/src/welcome-steps'

const sent = vi.hoisted(() => [] as Array<[string, string]>)

vi.mock('@/lib/traffic', () => ({
  reportWelcomeStep: async (step: string, item = '') => {
    sent.push([step, item])
    return true
  },
}))
vi.mock('@/hooks/useAgentAvatars', () => ({ useAgentAvatars: () => ({}) }))
/* A pay outcome is a POST to the production render (apps/vibee-editor/packages/test-guard/no-network.mjs):
 * kept here, never sent. */
vi.mock('@/lib/payOutcome', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/payOutcome')>()),
  reportPayOutcome: () => undefined,
}))
vi.mock('@/hooks/useAgentAcceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useAgentAcceptance')>()),
  useAgentAcceptance: () => null,
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: 'en', setLang: () => {}, t: (k: string) => k }),
}))

import { WelcomePage } from '@/pages/Welcome'
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  sent.length = 0
  window.localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  act(() => {
    root = createRoot(host)
    root.render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>
    )
  })
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
})

const press = (sel: string) => {
  const el = host.querySelector<HTMLElement>(sel)
  expect(el, sel).not.toBeNull()
  act(() => el!.click())
}

describe('the welcome heatmap', () => {
  it('counts the show', () => {
    expect(sent).toContainEqual(['shown', ''])
  })

  it('counts each way off the first screen', () => {
    press('.welcome-lang')
    press('.welcome-skip')
    expect(sent).toContainEqual(['lang', ''])
    expect(sent).toContainEqual(['skip', ''])
  })

  it('counts a package by its id, order and try apart', () => {
    press('[data-testid="package-blogger"] .package-card__order')
    press('[data-testid="package-blogger"] .package-card__try')
    expect(sent).toContainEqual(['package_order', 'blogger'])
    expect(sent).toContainEqual(['package_try', 'blogger'])
  })

  it('counts the pinned bar and the quiet exit', () => {
    press('.welcome-exit--primary')
    press('.welcome-exit--quiet')
    expect(sent.map(([s]) => s)).toEqual(
      expect.arrayContaining(['pinned_gift', 'market'])
    )
  })

  it('only ever reports a step on the shared list', () => {
    for (const el of host.querySelectorAll<HTMLElement>('a, button'))
      act(() => el.click())
    for (const [step] of sent)
      expect(WELCOME_STEPS as readonly string[]).toContain(step)
  })
})
