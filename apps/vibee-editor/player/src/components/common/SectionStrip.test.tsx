/**
 * ONE ROW, ONE READER OF THE ADDRESS.
 *
 * This file pins the two behaviours the app used to have in several
 * incompatible copies: which item reads as chosen (and is brought into
 * sight), and where the choice is kept.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SectionStrip, useSectionTab } from './SectionStrip'

const SECTIONS = [
  { id: 'clients', label: 'Клиенты', count: 12 },
  { id: 'events', label: 'События' },
  { id: 'leads', label: 'Лиды', count: null },
]

function Screen({ onSeen }: { onSeen?: (tab: string) => void }) {
  const [tab, pick] = useSectionTab(SECTIONS.map(s => s.id))
  onSeen?.(tab)
  return (
    <SectionStrip
      sections={SECTIONS}
      active={tab}
      onPick={pick}
      label="Разделы"
    />
  )
}

function Address({ report }: { report: (search: string) => void }) {
  report(useLocation().search)
  return null
}

describe('SectionStrip', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  const items = () => [
    ...host.querySelectorAll<HTMLButtonElement>('.section-strip__item'),
  ]

  const render = async (entry = '/crm') => {
    const seen: string[] = []
    const search: string[] = []
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[entry]}>
          <Screen onSeen={tab => seen.push(tab)} />
          <Address report={s => search.push(s)} />
        </MemoryRouter>
      )
    )
    return { seen, search }
  }

  it('draws one item per section and marks the chosen one', async () => {
    await render()
    expect(items().map(b => b.textContent)).toEqual([
      'Клиенты12',
      'События',
      // count: null is "no number", not zero -- a zero would be a claim.
      'Лиды',
    ])
    expect(items().map(b => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ])
  })

  it('opens on the section named in the address', async () => {
    const { seen } = await render('/crm?tab=leads')
    expect(seen.at(-1)).toBe('leads')
    expect(items()[2].getAttribute('aria-pressed')).toBe('true')
  })

  it('ignores a section that does not exist, rather than showing nothing', async () => {
    const { seen } = await render('/crm?tab=nonsense')
    expect(seen.at(-1)).toBe('clients')
  })

  it('writes the choice into the address, so a section can be linked to', async () => {
    const { search } = await render()
    await act(async () => items()[1].click())
    expect(search.at(-1)).toBe('?tab=events')
    expect(items()[1].getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the rest of the address, because a screen may carry more than a tab', async () => {
    const { search } = await render('/crm?who=27')
    await act(async () => items()[2].click())
    expect(search.at(-1)).toBe('?who=27&tab=leads')
  })
})
