/**
 * A DECISION IS WORTH A WORD. A PASS IS NOT.
 *
 * Owner, 25.09.2026: "the cards have layout problems -- they are stretched
 * vertically". Measured in the browser at 375px before touching anything:
 * three settled cards stood 311px tall, and a third of each was a line
 * reading "НЕ ВЫБРАНО" -- a label under every card the person simply had not
 * picked. The dimming already says that; saying it again cost a line and its
 * gap on every card the conversation scrolls past. After: 233px on the
 * phone, and 191 against 298 on a wide screen.
 *
 * What the person DECIDED keeps its word, because approved and declined are
 * facts they made and those do not go without saying.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentCards } from './AgentCards'
import type { AgentCard, CardState } from '@/lib/agentCards'

const cards: AgentCard[] = [
  { kind: 'card', title: 'Пропустить адрес', detail: 'нажму «Пропустить»' }, // cyrillic-ok: fixture copy
  { kind: 'card', title: 'Открыть почту', detail: 'потом открою Gmail' }, // cyrillic-ok: fixture copy
]

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

const show = (states: CardState[], actionable = false) => {
  act(() =>
    root.render(
      <AgentCards
        cards={cards}
        states={states}
        actionable={actionable}
        onAnswer={vi.fn()}
      />
    )
  )
  return host
}

describe('the settled cards do not repeat themselves', () => {
  /*
   * Counted, not read. The dictionary answers in whichever language is on,
   * and a guard that spells the Russian word passes or fails by the test
   * environment's locale rather than by the layout it is about.
   */
  const labels = () => host.querySelectorAll('.agent-card__state')

  it('a card nobody picked carries no label at all', () => {
    show(['open', 'open'])
    expect(labels().length).toBe(0)
  })

  it('but a decision keeps its word, both ways', () => {
    show(['approved', 'declined'])
    expect(labels().length).toBe(2)
    for (const l of labels()) expect((l.textContent ?? '').trim()).not.toBe('')
  })

  it('the word sits on the title row, not under the detail', () => {
    // Where it sits is what saves the line: the head holds both, and the
    // detail keeps the full width below them.
    const el = show(['approved', 'open'])
    const head = el.querySelector('.agent-card__head')
    expect(head).toBeTruthy()
    expect(head!.querySelector('h3')).toBeTruthy()
    expect(head!.querySelector('.agent-card__state')).toBeTruthy()
    expect(
      el.querySelector('.agent-card__body > p'),
      'the detail stays outside the head, at full width'
    ).toBeTruthy()
  })

  it('a live card is untouched: its buttons, no status word', () => {
    // The negative control for the whole change -- shrinking the card being
    // ASKED about would be the wrong economy.
    const el = show(['open', 'open'], true)
    expect(el.querySelectorAll('.agent-card__buttons').length).toBe(2)
    expect(el.querySelector('.agent-card--settled')).toBeNull()
    expect(el.querySelectorAll('.agent-card__state').length).toBe(0)
  })
})
