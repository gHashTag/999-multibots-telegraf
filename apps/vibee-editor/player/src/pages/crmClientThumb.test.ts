import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE CLIENT CARD'S ONE ACTION STAYS UNDER THE THUMB.
 *
 * CRM mobile loop, tick 3 (01.10.2026), measured at 390x844: the chat
 * button sat at y=132 and "Last messages" at y=1599. It now follows every
 * panel and sticks 12px above the bottom -- above the tab bar when the shell
 * draws one, above the home indicator when it does not. jsdom has no
 * layout, so this holds the rule; the order is held in CrmClient.test.tsx.
 */

const sheet = fs
  .readFileSync(path.join(__dirname, 'CrmClient.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const rule = (selector: string) => {
  const m = sheet.match(
    new RegExp(`(?:^|})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`)
  )
  return (m?.[1] ?? '').replace(/\s+/g, ' ')
}

describe('.crm-client__chat', () => {
  const chat = rule('.crm-client__chat')

  it('is sticky at the bottom', () => {
    expect(chat).toMatch(/position: sticky;/)
    expect(chat).toMatch(/bottom: calc\(/)
  })

  it('clears the tab bar and the home indicator, whichever is taller', () => {
    expect(chat).toMatch(
      /max\(var\(--app-tabbar-total, 0px\), var\(--app-safe-bottom, 0px\)\)/
    )
  })
})
