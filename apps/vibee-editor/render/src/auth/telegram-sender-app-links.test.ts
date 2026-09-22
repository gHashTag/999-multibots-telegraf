/**
 * A render notice never carries a raw app URL (owner, 2026-09-22: outside
 * Telegram the app does not open). sendToTelegram rewrites it into the t.me
 * link of the bot whose token sends it, learned with getMe on that bot's own
 * Bot API host. Fake fetch, fake token: no network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendToTelegram } from './telegram-sender'
import { forgetBotsOfTokensForTests } from '../app-links'

const TOKEN = '900000091:fake-secret'
let sent: any[] = []
let getMeCalls = 0

beforeEach(() => {
  forgetBotsOfTokensForTests()
  sent = []
  getMeCalls = 0
  vi.stubEnv('TELEGRAM_BOT_TOKEN', TOKEN)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith('/getMe')) {
        getMeCalls += 1
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: { username: 'example_farm_bot', has_main_web_app: false },
          }),
        }
      }
      sent.push(JSON.parse(String(init?.body ?? '{}')))
      return { ok: true, text: async () => '{}', json: async () => ({}) }
    })
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('sendToTelegram', () => {
  it('rewrites a raw app URL into the sending bot’s t.me link', async () => {
    await sendToTelegram(
      '900000092',
      'Откройте https://app.t27.ai/browser, агент ждёт.'
    )
    expect(sent).toHaveLength(1)
    expect(sent[0].text).toBe(
      'Откройте https://t.me/example_farm_bot?start=app_browser, агент ждёт.'
    )
  })

  it('does not ask getMe for a notice with no app URL', async () => {
    await sendToTelegram('900000092', 'Готово.')
    expect(sent[0].text).toBe('Готово.')
    expect(getMeCalls).toBe(0)
  })
})
