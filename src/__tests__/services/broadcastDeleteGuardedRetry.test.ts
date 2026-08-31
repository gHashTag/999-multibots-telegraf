/**
 * broadcast.service.ts sends to every user inside one Inngest
 * step.run('send-messages') (broadcastMessage.ts). Its per-recipient catch
 * removes a genuinely-gone user with supabase.from('users').delete(). That
 * delete was UNGUARDED: if it rejects (network blip, RLS/timeout), the throw
 * escapes the per-user catch and the send loop, aborts the step, and Inngest
 * RETRIES the whole step -- re-broadcasting to every already-delivered user
 * (non-idempotent duplicate send). Same escalation class as the #1201 mass-delete.
 *
 * The fix wraps the user-cleanup delete in its own try/catch that logs and
 * continues, so a best-effort cleanup failure can never abort the broadcast.
 * Source-level seam test: assert the send-loop delete sits inside a try whose
 * catch swallows. Mutation (removing the wrap) fails the test.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'services',
  'plan_b',
  'broadcast.service.ts'
)
const code = () => fs.readFileSync(SRC, 'utf8')

describe('broadcast user-cleanup delete cannot abort the send step (idempotent retry)', () => {
  it('wraps the send-loop delete in its own try/catch', () => {
    const s = code()
    // the send-loop delete removes a gone user by telegram_id + bot_name
    const del = s.indexOf(".eq('bot_name', user.bot_name)")
    expect(del, 'send-loop delete not found').toBeGreaterThan(-1)
    // the try that guards it must open shortly before the delete...
    const before = s.slice(Math.max(0, del - 400), del)
    expect(
      /try\s*\{/.test(before),
      'the user-cleanup delete is not inside a try -- a delete failure aborts the step and Inngest re-broadcasts'
    ).toBe(true)
    // ...and be closed by a catch shortly after
    const after = s.slice(del, del + 300)
    expect(
      /catch\s*\(\s*deleteErr/.test(after),
      'no catch swallows the user-cleanup delete failure'
    ).toBe(true)
  })
})
