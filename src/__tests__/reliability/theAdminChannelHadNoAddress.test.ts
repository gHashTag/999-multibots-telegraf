/**
 * THE ADMIN CHANNEL HAD NO ADDRESS, AND NOTHING SAID SO.
 *
 * Measured 2026-09-15 against the live Bot API with the production token, after
 * reading the deploy variable rather than assuming it:
 *
 *   ADMIN_CHAT_ID = neuro_blogger_pulse
 *   getChat  neuro_blogger_pulse  ->  400 Bad Request: chat not found
 *   getChat @neuro_blogger_pulse  ->  ok, supergroup -1002298297094
 *
 * A username addresses a chat only with the `@`. The repository had already
 * learned this once -- resolvePulseChatId adds it, and theAlertStormWasSelf-
 * Inflicted pins the exact value -- but the lesson was applied to ONE caller
 * while five others read the variable raw and handed it to Telegram unchanged:
 * the provider health monitor, the Inngest failure handler, the successful-
 * payment notice, the autofix notifier, and safe mode's redirect target.
 *
 * WHY IT SURVIVED. Two of those five send with `fetch`, which does not throw on
 * a 400: the response resolved, `resp.ok` was never read, and the `catch`
 * written to report exactly this failure could not run. A third printed
 * "Notification sent to admin" after its catch, on both paths. So the channel
 * was dead, and every mechanism that existed to notice was itself the reason
 * nobody did. Silence is not zero.
 *
 * The rule lives in one function now. This file pins the rule, and pins that
 * nobody may go around it -- because the defect was never the missing `@`, it
 * was five copies of a decision that only one of them got right.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeChatId, resolveAdminChatId } from '@/helpers/adminChatId'
import { resolvePulseChatId } from '@/helpers/pulseDestination'

const ROOT = path.resolve(__dirname, '../../..')

describe('an address Telegram will accept', () => {
  it('gives a bare username its @, which is the whole production defect', () => {
    expect(normalizeChatId('neuro_blogger_pulse')).toBe('@neuro_blogger_pulse')
  })

  it('leaves a numeric id alone, including a negative supergroup id', () => {
    expect(normalizeChatId('-1002298297094')).toBe('-1002298297094')
    expect(normalizeChatId('144022504')).toBe('144022504')
  })

  it('does not double the @ on a value that already has one', () => {
    expect(normalizeChatId('@neuro_blogger_pulse')).toBe('@neuro_blogger_pulse')
  })

  it('strips whitespace, which is invisible in a deploy variable', () => {
    // A trailing space answers "chat not found" as flatly as a missing @, and
    // is far harder to see in the Railway UI.
    expect(normalizeChatId('  neuro_blogger_pulse \n')).toBe(
      '@neuro_blogger_pulse'
    )
    expect(normalizeChatId(' -1002298297094 ')).toBe('-1002298297094')
  })

  it('reports nothing configured as null, not as an empty string', () => {
    // '' is falsy but it is also a value: passed to sendMessage it becomes a
    // request, and the caller cannot tell "unset" from "set to nothing".
    expect(resolveAdminChatId({} as NodeJS.ProcessEnv)).toBeNull()
    expect(resolveAdminChatId({ ADMIN_CHAT_ID: '' } as NodeJS.ProcessEnv)).toBe(
      null
    )
    expect(
      resolveAdminChatId({ ADMIN_CHAT_ID: '   ' } as NodeJS.ProcessEnv)
    ).toBeNull()
  })

  it('resolves the production value to the chat that actually answers', () => {
    expect(
      resolveAdminChatId({
        ADMIN_CHAT_ID: 'neuro_blogger_pulse',
      } as NodeJS.ProcessEnv)
    ).toBe('@neuro_blogger_pulse')
  })
})

describe('the pulse resolver still behaves, on the shared rule', () => {
  // resolvePulseChatId had the only correct copy of this logic and now defers
  // to the shared one. Its own suite still runs; these three are the cases
  // where deferring could have changed an answer.
  it('PULSE_CHAT_ID still wins over ADMIN_CHAT_ID', () => {
    expect(
      resolvePulseChatId({
        PULSE_CHAT_ID: '-100111',
        ADMIN_CHAT_ID: 'neuro_blogger_pulse',
      } as NodeJS.ProcessEnv)
    ).toBe('-100111')
  })

  it('a whitespace-only PULSE_CHAT_ID falls through instead of winning', () => {
    expect(
      resolvePulseChatId({
        PULSE_CHAT_ID: '   ',
        ADMIN_CHAT_ID: '-1002298297094',
      } as NodeJS.ProcessEnv)
    ).toBe('-1002298297094')
  })

  it('with nothing set it still uses the measured id', () => {
    expect(resolvePulseChatId({} as NodeJS.ProcessEnv)).toBe('-1002298297094')
  })
})

/** Every non-test source under src. */
function sources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (
        p.endsWith('.ts') &&
        !p.endsWith('.test.ts') &&
        !p.includes('__tests__')
      )
        out.push(p)
    }
  }
  walk(path.join(ROOT, 'src'))
  return out
}

describe('nobody addresses the admin channel by hand', () => {
  // The one file allowed to read the raw variable is the one that knows what
  // to do with it.
  const RESOLVER = 'src/helpers/adminChatId.ts'

  it('floor: the census can see the files it claims to check', () => {
    // Without this the ratchet passes vacuously the day the walk breaks or src
    // moves, reporting a clean repository because it read nothing.
    const files = sources()
    expect(files.length, 'the source walk found nothing').toBeGreaterThan(300)
    expect(
      files.some(f => f.endsWith('helpers/adminChatId.ts')),
      'the resolver itself is not in the population being searched'
    ).toBe(true)
  })

  it('no runtime file reads process.env.ADMIN_CHAT_ID directly', () => {
    const raw = sources()
      .filter(f => {
        const rel = path.relative(ROOT, f)
        if (rel === RESOLVER) return false
        const text = fs.readFileSync(f, 'utf8')
        // Comments are allowed to name the variable -- several explain why the
        // resolver exists. Only a read of the value counts.
        return /process\.env\.ADMIN_CHAT_ID|process\.env\[['"]ADMIN_CHAT_ID['"]\]/.test(
          text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        )
      })
      .map(f => path.relative(ROOT, f))

    expect(
      raw,
      `A new sender is addressing the admin channel by hand. Production sets ` +
        `ADMIN_CHAT_ID to a bare username and Telegram answers "chat not found" ` +
        `for it, so a raw read is a message that silently goes nowhere. Use ` +
        `resolveAdminChatId() from helpers/adminChatId.ts.`
    ).toEqual([])
  })

  it('the senders that use fetch read resp.ok', () => {
    // `fetch` resolves on a 400. Both of these had a try/catch that could not
    // fire and so reported a refused send as a delivered one, for months. A
    // Telegraf `sendMessage` throws and needs no equivalent check, which is why
    // only the fetch callers are listed.
    const FETCH_SENDERS = [
      'src/services/provider-health-monitor.ts',
      'src/inngest_app/client.ts',
    ]
    for (const rel of FETCH_SENDERS) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8')
      expect(
        text,
        `${rel} no longer sends to Telegram -- move it off this list rather ` +
          `than leaving an assertion that passes by absence`
      ).toContain('api.telegram.org')
      expect(
        text,
        `${rel} sends to Telegram with fetch and never reads resp.ok, so a ` +
          `refused send is indistinguishable from a delivered one`
      ).toMatch(/if\s*\(!\s*resp\.ok\s*\)/)
    }
  })
})
