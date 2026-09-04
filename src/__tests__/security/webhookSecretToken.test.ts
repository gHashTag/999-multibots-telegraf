import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { webhookSecretFor } from '@/utils/webhookSecret'

/**
 * A Telegram webhook endpoint is protected by exactly two things: the secrecy
 * of its URL, and the secret token Telegram echoes in
 * X-Telegram-Bot-Api-Secret-Token.
 *
 * Here the URL is `https://<domain>/<botUsername>` -- the bot's public @name
 * under a known domain, so it is guessable -- and the secret token was not set
 * at all. A forged POST to that path is an arbitrary Telegram update whose
 * `from.id` the sender chooses, and several gates in this codebase decide on
 * `from.id` alone, including the admin check on the module that runs shell
 * commands on the production server.
 *
 * Latent rather than live: the launch path takes polling unless WEBHOOK_DOMAIN
 * is set, and polling has no endpoint to forge. One environment variable is
 * the whole distance between latent and live, which is why this is fixed
 * rather than noted.
 *
 * Telegraf both sends the token to setWebhook and REJECTS a delivery whose
 * header does not match, so the single option closes both ends.
 *
 * The value is derived from the bot token rather than configured, so it is on
 * from the first deploy. A guard that stays off until someone remembers to set
 * a variable is the shape this loop keeps finding.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// Deliberately NOT shaped like a Telegram token (<digits>:<letters>). The
// repo's secret-guard hook matches that shape and refused the commit when the
// fixtures looked realistic -- correctly, since a fixture that looks like a
// credential is indistinguishable from a leaked one at review time.
const FAKE_A = 'not-a-real-bot-token-alpha'
const FAKE_B = 'not-a-real-bot-token-beta'

describe('the webhook secret token', () => {
  it('is stable for a token and different across tokens', () => {
    const a = webhookSecretFor(FAKE_A)
    const b = webhookSecretFor(FAKE_A)
    const c = webhookSecretFor(FAKE_B)
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('is accepted by Telegram: 1-256 chars of A-Z a-z 0-9 _ -', () => {
    const s = webhookSecretFor(FAKE_A)
    expect(s).toMatch(/^[A-Za-z0-9_-]{1,256}$/)
    expect(s.length).toBeGreaterThanOrEqual(32)
  })

  it('refuses to derive a secret from nothing', () => {
    // An empty token would otherwise produce a CONSTANT secret shared by every
    // bot that failed to load one -- a guard that looks present and protects
    // nothing.
    expect(() => webhookSecretFor('')).toThrow()
    expect(() => webhookSecretFor(undefined as unknown as string)).toThrow()
  })

  it('does not leak the bot token', () => {
    const s = webhookSecretFor(FAKE_A)
    expect(s).not.toContain(FAKE_A)
    expect(s).not.toContain(FAKE_A.split('-').pop() as string)
  })

  it('is wired into every place that establishes a webhook', () => {
    // Both, and the second one on purpose: utils/webhook-manager.ts has no
    // importers today, and a dead copy that sets a webhook WITHOUT the secret
    // is a trap -- reviving it would switch the protection off silently.
    const sites: Array<[string, RegExp]> = [
      ['src/bot.ts', /secretToken:\s*webhookSecretFor\(/],
      ['src/utils/webhook-manager.ts', /secret_token:\s*webhookSecretFor\(/],
    ]
    for (const [file, wanted] of sites) {
      expect(read(file), file).toMatch(wanted)
    }
  })

  it('still has a webhook launch to protect', () => {
    // Control: if bot.ts stopped launching in webhook mode, the assertion above
    // would keep passing while guarding nothing.
    expect(read('src/bot.ts')).toMatch(/webhook:\s*\{/)
    expect(read('src/utils/webhook-manager.ts')).toMatch(/setWebhook\(/)
  })
})
