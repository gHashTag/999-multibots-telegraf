/**
 * Owner, 2026-09-22: "we are stuck on a simple task -- pull the button and
 * get in". browser_click can take the label; the probe is run here against
 * a stub page.
 */
import { describe, it, expect } from 'vitest'
import { findProbe, foundOf } from './src/browser/find-target'
import { stepOf } from './src/browser/journal'
import { stepInWords } from './src/browser/report'

type Box = { left: number; top: number; width: number; height: number }
function el(
  tag: string,
  text: string,
  box: Box,
  extra: Record<string, string> = {}
) {
  let scrolled = 0
  return {
    tag,
    innerText: text,
    value: '',
    getAttribute: (k: string) => extra[k] ?? null,
    getBoundingClientRect: () => ({ ...box, top: box.top - scrolled }),
    scrollIntoView: () => {
      scrolled = box.top - 300
    },
    style: extra.hidden ? 'hidden' : 'shown',
  }
}
function run(text: string, iframes: unknown[], buttons: unknown[]) {
  const document = {
    querySelectorAll: (sel: string) =>
      sel.startsWith('iframe') ? iframes : buttons,
  }
  const getComputedStyle = (e: { style: string }) => ({
    visibility: e.style === 'hidden' ? 'hidden' : 'visible',
    display: 'block',
    opacity: '1',
  })
  return new Function(
    'document',
    'getComputedStyle',
    `return ${findProbe(text)}`
  )(document, getComputedStyle)
}

describe('press the button by what it says', () => {
  it('Google: presses Google’s own button frame, scrolled into view', () => {
    const frame = el('iframe', '', {
      left: 20,
      top: 900,
      width: 300,
      height: 40,
    })
    const got = foundOf(run('Google', [frame], []))
    expect(got).toMatchObject({ how: 'google-frame', x: 170, y: 320 })
  })

  it('the shortest matching label wins, an exact one beats all', () => {
    const long = el('button', 'Сохранить и продолжить позже', {
      left: 0,
      top: 100,
      width: 200,
      height: 40,
    }) // cyrillic-ok: page text
    const exact = el('button', 'Сохранить', {
      left: 0,
      top: 200,
      width: 100,
      height: 40,
    }) // cyrillic-ok: page text
    expect(foundOf(run('сохранить', [], [long, exact]))?.label).toBe(
      'сохранить'
    ) // cyrillic-ok: page text
  })

  it('invisible and tiny elements never match; nothing is null', () => {
    const hidden = el(
      'button',
      'Skip',
      { left: 0, top: 0, width: 80, height: 30 },
      { hidden: '1' }
    )
    const tiny = el('a', 'Skip', { left: 0, top: 0, width: 2, height: 2 })
    expect(run('skip', [], [hidden, tiny])).toBeNull()
  })

  it('matches the aria-label of an icon button', () => {
    const icon = el(
      'button',
      '',
      { left: 10, top: 10, width: 40, height: 40 },
      { 'aria-label': 'Continue with Google' }
    )
    expect(foundOf(run('continue with google', [], [icon]))?.how).toBe('text')
  })
})

describe('the person reads which button, not a point', () => {
  it('journal and report say the label', () => {
    const step = stepOf(
      'browser_click',
      { text: 'Google' },
      { result: { clicked: { x: 170, y: 320 } } },
      3
    )
    expect(step.detail).toMatchObject({ x: 170, y: 320, what: 'Google' })
    expect(
      stepInWords({
        at: '',
        tool: 'browser_click',
        ok: true,
        ms: 3,
        detail: step.detail,
      })
    ).toContain('«Google»')
  })
})
