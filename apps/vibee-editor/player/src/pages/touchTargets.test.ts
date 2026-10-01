import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A PHONE CAN REACH EVERY CONTROL OF THE CHAT AND THE CRM.
 *
 * Measured at 390px (CRM mobile loop, 01.10.2026): copy / retry under a
 * message sat at opacity 0 until :hover, which a finger never produces; the
 * aside's close was 32x32, the message actions ~20px tall, and "more clients"
 * / "pick everyone waiting" were under the 44px touch token.
 *
 * jsdom has no layout and no pointer media, so this reads the sheets and
 * keeps the media query each rule lives under.
 */

function sheet(name: string): string {
  return fs
    .readFileSync(path.join(__dirname, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Every rule as [media, selectors, body]; media is '' at the top level. */
function rules(css: string): [string, string[], string][] {
  const out: [string, string[], string][] = []
  const walk = (text: string, media: string) => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf('{', i)
      if (open < 0) break
      const head = text.slice(i, open).trim()
      let depth = 1
      let j = open + 1
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
        j++
      }
      const body = text.slice(open + 1, j - 1)
      if (head.startsWith('@media')) walk(body, head.replace(/\s+/g, ' '))
      else
        out.push([
          media,
          head.split(',').map(s => s.trim().replace(/\s+/g, ' ')),
          body,
        ])
      i = j
    }
  }
  walk(css, '')
  return out
}

function bodiesFor(css: string, selector: string, media: RegExp | '') {
  return rules(css)
    .filter(([m, s]) => s.includes(selector))
    .filter(([m]) => (media === '' ? m === '' : media.test(m)))
    .map(([, , b]) => b)
}

const chat = sheet('Chat.css')
const crm = sheet('Crm.css')
const COARSE = /pointer:\s*coarse/
const FINE_HOVER = /hover:\s*hover\)\s*and\s*\(pointer:\s*fine/

describe('touch reach of the chat and the CRM', () => {
  it('message actions are visible unless a real mouse can hover them', () => {
    for (const body of bodiesFor(chat, '.message-actions', ''))
      expect(body).not.toMatch(/opacity:\s*0\b/)
    expect(bodiesFor(chat, '.message-actions', FINE_HOVER).join()).toMatch(
      /opacity:\s*0\b/
    )
    expect(
      bodiesFor(chat, '.message:focus-within .message-actions', FINE_HOVER)
    ).toHaveLength(1)
  })

  it('small chat controls grow to the touch tokens on a coarse pointer', () => {
    const close = bodiesFor(chat, '.chat-aside__close', COARSE).join()
    expect(close).toMatch(/width:\s*var\(--touch-target\b/)
    expect(close).toMatch(/height:\s*var\(--touch-target\b/)
    expect(bodiesFor(chat, '.message-action', COARSE).join()).toMatch(
      /min-height:\s*var\(--touch-target-sm\b/
    )
  })

  it('the CRM paging and bulk-pick buttons reach the touch target', () => {
    for (const sel of ['.crm__more', '.crm__pick-all'])
      expect(bodiesFor(crm, sel, COARSE).join()).toMatch(
        /min-height:\s*var\(--touch-target\b/
      )
  })

  it('no :hover rule of the chat paints a sticky state on touch', () => {
    const bare = rules(chat).filter(
      ([m, s]) =>
        !/hover:\s*hover/.test(m) &&
        s.some(x => x.includes(':hover')) &&
        // revealing on hover is fine; only paint-on-hover sticks after a tap
        !s.every(x => x.includes('.message:hover'))
    )
    expect(bare.map(([, s]) => s.join(', '))).toEqual([])
  })
})
