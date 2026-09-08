/**
 * The owner's error alert must carry the details, not only the title.
 *
 * Live 2026-09-08 14:18 UTC: the owner received the alert title only --
 * "[answerAi] xAI Grok API error" and nothing else -- the log call's meta
 * ({ status: 400, error: 'Model not found: grok-2-latest', model }) was dropped
 * by the winston transport, which forwarded only the message string. The owner's
 * words: alerts arrive without the error details.
 *
 * Two links, each pinned: the transport renders the remaining meta as compact,
 * redacted, capped JSON and passes it as `details`; logError escapes the text
 * for HTML and appends the details in a <pre> block. An unescaped '<' in an
 * error text would otherwise make Telegram reject the whole alert (400 can't
 * parse entities) -- silence disguised as a formatting error.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { detailsForAlert } from '@/utils/logger'

describe('detailsForAlert', () => {
  it('renders the non-routed meta as JSON and drops the routed keys', () => {
    const d = detailsForAlert({
      context: 'logger.error',
      telegramId: '1',
      username: 'u',
      botName: 'b',
      status: 400,
      error: 'Model not found: grok-2-latest',
      model: 'grok-2-latest',
    })!
    expect(d).toContain('"status": 400')
    expect(d).toContain('Model not found: grok-2-latest')
    expect(d).not.toContain('telegramId')
    expect(d).not.toContain('logger.error')
  })

  it('returns undefined when nothing but routing keys is present', () => {
    expect(detailsForAlert({ context: 'x', telegramId: 5 })).toBeUndefined()
    expect(detailsForAlert(undefined)).toBeUndefined()
  })

  it('redacts API keys and bot tokens, renders Errors with a short stack, caps the size', () => {
    const err = new Error('boom')
    const d = detailsForAlert({
      error: err,
      key: 'sk-proj-' + 'A'.repeat(24),
      token: '123456789:' + 'AAHfakeToken' + 'A'.repeat(23),
      big: 'x'.repeat(5000),
    })!
    expect(d).toContain('boom')
    expect(d).not.toContain('sk-proj-AAAA')
    expect(d).not.toContain('AAHfakeToken')
    expect(d.length).toBeLessThanOrEqual(1201)
  })
})

describe('the transport hands the details over', () => {
  it('sendToTelegram passes details: detailsForAlert(meta) to logError', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/utils/logger.ts'),
      'utf8'
    )
    const body = src.slice(
      src.indexOf('private async sendToTelegram'),
      src.indexOf('log(info: any')
    )
    expect(body).toContain('details: detailsForAlert(meta)')
  })
})

describe('logError sends the details, HTML-safe', () => {
  it('escapes the error text and appends details in <pre>', async () => {
    vi.resetModules()
    const { telegramLogService } = await import(
      '@/services/telegram-log.service'
    )
    const sendMessage = vi.fn(async () => ({}))
    ;(telegramLogService as any).initializeOnce({
      catch: vi.fn(),
      telegram: { sendMessage },
      botInfo: { username: 'neuro_blogger_bot' },
    })
    await telegramLogService.logError({
      error: '[answerAi] xAI Grok API error a < b & c',
      context: 'logger.error',
      details: '{"status": 400, "error": "Model <not> found"}',
    })
    expect(sendMessage).toHaveBeenCalledTimes(1)
    const [, text, extra] = sendMessage.mock.calls[0] as any[]
    expect(extra.parse_mode).toBe('HTML')
    expect(text).toContain('a &lt; b &amp; c')
    expect(text).not.toContain('a < b')
    expect(text).toContain('<pre>')
    expect(text).toContain('Model &lt;not&gt; found')
    expect(text).toContain('"status": 400')
  })
})
