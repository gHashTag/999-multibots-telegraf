import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE CLIENT CONVERSATION'S TOP ROW FITS A PHONE.
 *
 * CRM mobile loop, tick 6 (01.10.2026), measured at 390x844: the row
 * (back, title, Card, Queen) was 490px wide, the title's ellipsis never
 * fired because the row itself could not shrink, and the whole page
 * scrolled sideways to 502px with the Queen off the screen. Back was a 20px
 * target, Card and Queen 28px. After: 390px, 44px targets, the client's
 * name in the title. jsdom has no layout, so this holds the rules; the name
 * is held in Chat.clientThread.test.tsx.
 */

const sheet = fs
  .readFileSync(path.join(__dirname, 'Chat.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')

/** Every top-level block for exactly this selector, joined. */
const rules = (selector: string) =>
  [
    ...sheet.matchAll(
      new RegExp(`\\} ${selector.replace(/\./g, '\\.')} \\{([^}]*)\\}`, 'g')
    ),
  ]
    .map(m => m[1])
    .join(' ')

describe('.chat-client, the top row of a client conversation', () => {
  it('stops at the screen instead of widening the page', () => {
    expect(rules('.chat-client')).toMatch(/min-width: 0;/)
    expect(rules('.chat-client')).toMatch(/max-width: 100%;/)
  })

  it('lets the title take the cut', () => {
    expect(rules('.chat-client__title')).toMatch(/min-width: 0;/)
  })

  it('makes back, Card and Queen 44px targets under a finger', () => {
    expect(sheet).toMatch(
      /@media \(pointer: coarse\) \{ \.chat-client__back, \.chat-client__card \{[^}]*min-height: 44px;/
    )
    expect(sheet).toMatch(/\.chat-client__back \{ min-width: 44px; \}/)
  })

  it('keeps Card and Queen together at the right edge', () => {
    expect(sheet).toMatch(
      /@media \(max-width: 1099px\) \{ \.chat-client__card\.chat-client__queen \{ margin-left: 0; \}/
    )
  })
})
