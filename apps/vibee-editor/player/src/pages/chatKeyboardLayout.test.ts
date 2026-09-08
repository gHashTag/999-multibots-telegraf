import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE AGENT CHAT MUST STAY USABLE WITH THE KEYBOARD OPEN.
 *
 * Owner's screenshot, 08.09.2026, iPhone inside Telegram: the fixed greeting
 * block (title, subtitle, two chips) took half of the visible screen once the
 * keyboard was up, and the composer ("+", input, Send) was covered by the
 * bottom tab bar. Cause: the page was sized to the STABLE viewport (the one
 * without the keyboard) while the tab bar is fixed to the live bottom edge.
 *
 * Pins, structural and mutation-checked:
 *  - the hook derives html[data-keyboard] from viewportHeight vs
 *    viewportStableHeight with a threshold, only for finite numbers;
 *  - under the keyboard the document, the chat page and the tab bar follow:
 *    live height, live height, hidden (and its height leaves the math);
 *  - the fixed greeting is gone: a slim toolbar keeps only the two controls,
 *    the agent's greeting lives in the scrollable list.
 */
const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

describe('agent chat under the keyboard', () => {
  const hook = read('hooks/useTelegramWebApp.ts')
  const tg = read('styles/telegram.css')
  const bar = read('components/Navigation/TelegramTabBar.css')
  const css = read('pages/Chat.css')
  const tsx = read('pages/Chat.tsx')

  it('the hook publishes data-keyboard from the two heights, guarded and thresholded', () => {
    expect(hook).toMatch(/const KEYBOARD_THRESHOLD_PX = \d{2,3}/)
    expect(hook).toContain('live < stable - KEYBOARD_THRESHOLD_PX')
    expect(hook).toContain("'data-keyboard'")
    expect(hook).toContain(
      'applyKeyboard(keyboardIsOpen(wa.viewportHeight, wa.viewportStableHeight))'
    )
    expect(hook).toMatch(
      /Number\.isFinite\(live\)[\s\S]*Number\.isFinite\(stable\)/
    )
  })

  it('under the keyboard the document and the chat page use the LIVE height', () => {
    expect(tg).toMatch(
      /html\[data-tg='1'\]\[data-keyboard='open'\],\s*html\[data-tg='1'\]\[data-keyboard='open'\] body,\s*html\[data-tg='1'\]\[data-keyboard='open'\] #root \{\s*height: var\(--app-vh, var\(--app-vh-stable\)\);/
    )
    expect(css).toMatch(
      /html\[data-keyboard='open'\] \.chat-page \{\s*height: var\(--app-vh, 100dvh\);/
    )
  })

  it('under the keyboard the tab bar is hidden and its height leaves the layout math', () => {
    expect(bar).toMatch(
      /html\[data-keyboard='open'\] \.tma-tabbar \{\s*display: none;/
    )
    expect(bar).toMatch(
      /html\[data-keyboard='open'\] \{\s*--app-tabbar-height: 0px;/
    )
    expect(bar).toMatch(
      /html\[data-keyboard='open'\] \{[^}]*--app-tabbar-total: 0px;/
    )
  })

  it('the fixed greeting is gone; the toolbar keeps only the two controls', () => {
    expect(tsx).not.toContain('className="chat-title"')
    expect(tsx).not.toContain('<h1>Агент</h1>')
    expect(tsx).toContain('className="chat-toolbar"')
    const toolbar = tsx.slice(
      tsx.indexOf('className="chat-toolbar"'),
      tsx.indexOf('className="chat-container"')
    )
    expect(toolbar).toContain('className="chat-reset"')
    expect(toolbar).toContain('className="chat-tokens"')
    expect(toolbar).not.toMatch(/<p>|<h1>/)
    expect(css).toMatch(/\.chat-toolbar \{[^}]*padding: 8px 14px/)
  })

  it('focusing the composer scrolls the list to its end (the keyboard hides the last message otherwise)', () => {
    expect(tsx).toMatch(
      /onFocus=\{\(\) => \{[\s\S]{0,300}scrollRef\.current\.scrollTop = scrollRef\.current\.scrollHeight/
    )
  })
})
