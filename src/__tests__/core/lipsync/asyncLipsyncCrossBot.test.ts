/**
 * AsyncLipSyncManager is a process-wide SINGLETON (getInstance / exported
 * asyncLipSyncManager). It kept one mutable `this.bot`, set by whichever bot
 * called setBotInstance LAST. Every delivery (sendSuccessResult /
 * sendErrorResult / sendCriticalError) sent through that shared `this.bot`, so
 * a job started under @botA could be delivered — video, refund text — by @botB
 * (cross-bot misdelivery: wrong sender, or a failed send to a chat that bot
 * cannot reach). Fix: resolve the bot that OWNS the job from job.botInfo.username
 * and route every send through it.
 *
 * Source-level seam test (delivery is deep inside async handlers with live
 * Telegram/axios I/O). Mutation — reverting any send to this.bot.telegram, or
 * dropping the per-job resolution — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'core',
  'lipsync',
  'async-lipsync-manager.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('AsyncLipSyncManager delivers via the per-job bot, not the singleton', () => {
  it('defines getBotForJob resolving from job.botInfo via the name adapter', () => {
    const s = code()
    const m = s.match(
      /private getBotForJob\(job: AsyncLipSyncJob\): any \{[\s\S]{0,400}?\n {2}\}/
    )
    expect(m, 'no getBotForJob helper').not.toBeNull()
    const body = m![0]
    expect(
      /job\.botInfo\?\.username/.test(body),
      'getBotForJob must key off job.botInfo.username'
    ).toBe(true)
    expect(
      /getBotByNameAdapter\(/.test(body),
      'getBotForJob must resolve the owning bot by name'
    ).toBe(true)
  })

  it('routes NO delivery through the shared singleton this.bot', () => {
    const s = code()
    const stray = (s.match(/this\.bot\.telegram/g) || []).length
    expect(stray, 'a delivery still sends through the singleton this.bot').toBe(
      0
    )
  })

  it('resolves a per-job bot in every delivery method before sending', () => {
    const s = code()
    // one `const bot = this.getBotForJob(job)` per delivery method
    const resolves = (s.match(/const bot = this\.getBotForJob\(job\)/g) || [])
      .length
    // every telegram send now goes through the resolved `bot`
    const sends = (s.match(/\bbot\.telegram\.send/g) || []).length
    expect(resolves, 'expected 3 delivery methods to resolve per-job bot').toBe(
      3
    )
    expect(sends, 'expected sends routed through the resolved bot').toBe(6)
  })
})
