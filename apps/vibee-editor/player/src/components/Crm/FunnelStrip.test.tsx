import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: 'en',
    // A known stage comes back as a label, an unknown one as its own key --
    // which is what the real dictionary does for a key it lacks.
    t: (key: string, vars?: Record<string, unknown>) =>
      key === 'crm.stage.unknownish'
        ? key
        : key.startsWith('crm.stage.')
          ? `label(${key.slice(10)})`
          : vars
            ? `${key}:${Object.values(vars).join(',')}`
            : key,
  }),
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/lib/embedGuest', () => ({ markEmbedSignInNeeded: () => {} }))

import { FunnelStrip } from './FunnelStrip'
import { toFunnel, type Funnel, type Reached } from '@/lib/crm'

/**
 * THE FUNNEL STRIP. Each case is a way it could lie: zeros for a server that
 * did not answer, stages out of order, or a stage the server never sent.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const draw = (state: Reached<Funnel>) =>
  act(() => root.render(<FunnelStrip state={state} />))

const chips = () =>
  [...host.querySelectorAll('.crm-funnel__chip')].map(li => [
    li.getAttribute('data-stage'),
    li.querySelector('.crm-funnel__count')?.textContent,
  ])

describe('toFunnel', () => {
  it('puts the server stages in funnel order and keeps every count', () => {
    const f = toFunnel({
      people_with_messages: 42,
      by_stage: {
        client: 5,
        refused: 2,
        later: 1,
        talking: 7,
        written: 9,
        winback: 3,
        new: 15,
      },
    })
    expect(f.people).toBe(42)
    expect(f.stages).toEqual([
      { stage: 'new', count: 15 },
      { stage: 'written', count: 9 },
      { stage: 'talking', count: 7 },
      { stage: 'client', count: 5 },
      { stage: 'winback', count: 3 },
      { stage: 'later', count: 1 },
      { stage: 'refused', count: 2 },
    ])
  })

  it('invents no stage the server did not send, and keeps an unknown one last', () => {
    const f = toFunnel({ by_stage: { client: 1, invoiced: 4, new: 0 } })
    expect(f.stages.map(s => s.stage)).toEqual(['new', 'client', 'invoiced'])
    expect(f.people).toBeNull()
  })

  it('an answer without by_stage has no stages', () => {
    expect(toFunnel({}).stages).toEqual([])
    expect(toFunnel({ by_stage: [1, 2] }).stages).toEqual([])
  })
})

describe('the funnel strip', () => {
  it('draws one chip per stage with its count', async () => {
    await draw({
      reachable: true,
      data: toFunnel({
        people_with_messages: 20,
        by_stage: { client: 4, new: 10, talking: 6 },
      }),
    })
    expect(chips()).toEqual([
      ['new', '10'],
      ['talking', '6'],
      ['client', '4'],
    ])
    expect(host.textContent).toContain('label(new)')
    expect(host.textContent).toContain('crm.funnel.people:20')
  })

  it('an unreachable server draws nothing, not zeros', async () => {
    await draw({ reachable: false, data: null, error: 'server answered 500' })
    expect(host.innerHTML).toBe('')
  })

  it('a reachable answer without stages draws nothing', async () => {
    await draw({ reachable: true, data: toFunnel({}) })
    expect(host.innerHTML).toBe('')
  })

  it('a stage the dictionary does not know is shown by its own name', async () => {
    await draw({
      reachable: true,
      data: toFunnel({ by_stage: { unknownish: 2 } }),
    })
    expect(host.querySelector('.crm-funnel__name')?.textContent).toBe(
      'unknownish'
    )
  })
})
