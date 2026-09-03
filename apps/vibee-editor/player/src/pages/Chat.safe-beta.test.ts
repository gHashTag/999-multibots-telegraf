// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./Chat.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./Chat.css', import.meta.url), 'utf8')
const headerSource = readFileSync(
  new URL('../components/Header/Header.tsx', import.meta.url),
  'utf8'
)
const headerStyles = readFileSync(
  new URL('../components/Header/styles.css', import.meta.url),
  'utf8'
)
const appStyles = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

describe('Chat SAFE BETA surface', () => {
  it('mounts the scoped control center without a paid model-chat dispatch', () => {
    expect(source).toContain('<AgentControlCenter compact />')
    expect(source).toContain('Свободный модельный чат временно выключен')
    expect(source).toContain('disabled')
    expect(source).not.toMatch(
      /fetch\(|api\/agent\/chat|authHeaders|GLM_API_KEY/i
    )
  })

  it('has no browser key fallback, invoice, balance or voice path', () => {
    expect(source).not.toMatch(
      /VITE_AGENT_KEY|X-Agent-Key|tokens\/invoice|my_balance|VoiceDraftControl|openInvoice/
    )
    expect(source).not.toMatch(/пополнить|токенов|картинка — 1|видео — 20/i)
    expect(styles).not.toMatch(
      /chat-tokens|chat-topup|баланс токенов|пополнение токенов/i
    )
  })

  it('shows the immutable cost boundary instead of accepting arbitrary input', () => {
    expect(source).toContain('Модельный чат недоступен в SAFE BETA')
    expect(source).toContain('может расходовать')
    expect(source).not.toMatch(/onChange|onKeyPress|onSubmit|onClick=\{send\}/)
  })

  it('keeps the mounted control center bounded inside the fixed chat viewport', () => {
    expect(styles).toMatch(
      /\.chat-page > \.agent-control\s*\{[^}]*max-height:/s
    )
    expect(styles).toMatch(
      /\.chat-page > \.agent-control\s*\{[^}]*overflow-y:\s*auto/s
    )
  })

  it('keeps editor diagnostics in a dedicated responsive grid row', () => {
    expect(headerSource).toMatch(
      /className="[^"]*\bheader-diagnostic-alert\b[^"]*"/
    )
    expect(headerStyles).toMatch(
      /\.header-diagnostic-alert\s*\{[^}]*min-height:\s*var\(--header-diagnostic-height/s
    )
    expect(appStyles).toContain(
      '.editor:has(> .header-diagnostic-alert) > .editor-main'
    )
    expect(appStyles).toMatch(
      /(['"])diagnostic diagnostic\1\s*\n\s*(['"])sidebar canvas\2/s
    )
  })
})
