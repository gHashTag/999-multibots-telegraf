import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/*
 * "IMAGE NOT FOUND. STARTING OVER." IS NOT AN EXCEPTION.
 *
 * The branch replies, rewinds the wizard and returns. Nothing throws, so
 * bot.catch never runs and the alert channel repaired in #2235/#2236 carries
 * nothing. The owner reported exactly this text and had no way to see it, and
 * neither did I: with no report there is no evidence, and the cause of the lost
 * imageUrl cannot be named honestly -- only guessed at.
 *
 * The payload is the point. Whether the REST of the session survived separates
 * "one key was lost" from "the session was empty", and those have different
 * causes. Names only: session fields carry prompts and file links that carry a
 * bot token.
 */
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
const logError = vi.fn().mockResolvedValue(undefined)
vi.mock('@/services/telegram-log.service', () => ({
  telegramLogService: { logError: (...a: unknown[]) => logError(...a) },
}))

import {
  reportDeadEnd,
  shouldReport,
  sessionKeysOf,
} from '@/helpers/error/reportDeadEnd'

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
/** Source with comment lines dropped: a quotation is not an invocation. */
const codeOf = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n')

const ctxWith = (session: Record<string, unknown>) =>
  ({
    from: { id: 144022504, username: 'owner' },
    botInfo: { username: 'some_bot' },
    session,
  }) as never

describe('a dead end must report itself', () => {
  beforeEach(() => {
    logError.mockClear()
    vi.clearAllMocks()
  })

  it('reports what was missing AND what the session still held', async () => {
    await reportDeadEnd(
      ctxWith({ selectedVideoModel: 'kling', __scenes: {}, mode: 'i2v' }),
      'imageToVideoWizard step 3',
      ['imageUrl']
    )
    const arg = logError.mock.calls[0][0] as { error: string }
    expect(arg.error).toContain('imageUrl')
    expect(arg.error).toContain('selectedVideoModel')
    expect(arg.error).toContain('__scenes')
  })

  it('never carries a session VALUE into the report', async () => {
    // A file link carries the bot token; a prompt is somebody's text. The
    // report exists to be pasted into a chat, so values may never enter it.
    await reportDeadEnd(
      ctxWith({
        imageUrl: 'https://api.telegram.org/file/bot1234:SECRET/x.jpg',
      }),
      'anywhere',
      ['prompt']
    )
    const arg = logError.mock.calls[0][0] as { error: string }
    expect(arg.error).toContain('imageUrl')
    expect(arg.error).not.toContain('SECRET')
    expect(arg.error).not.toContain('api.telegram.org')
  })

  it('a stuck person taps more than once, so it is once a minute per place', () => {
    const seen = new Map<string, number>()
    expect(shouldReport('a:1', 1_000_000, seen)).toBe(true)
    expect(shouldReport('a:1', 1_030_000, seen)).toBe(false)
    expect(shouldReport('a:1', 1_061_000, seen)).toBe(true)
    // a different place, or a different person, is not muted by the first
    expect(shouldReport('b:1', 1_030_000, seen)).toBe(true)
    expect(shouldReport('a:2', 1_030_000, seen)).toBe(true)
  })

  it('an empty or absent session is said in words, not as an empty list', () => {
    expect(sessionKeysOf(undefined)).toEqual([])
    expect(sessionKeysOf({ b: 1, a: 2 })).toEqual(['a', 'b'])
  })

  it('every dead end the owner reported is wired to it', () => {
    // Structural, because these branches cannot be reached without a wizard:
    // the risk is that one of the four is added back without a witness.
    const wired = [
      'src/scenes/imageToVideoWizard/index.ts',
      'src/scenes/lipSyncWizard/ai-reels-wizard.ts',
      'src/scenes/lipSyncWizard/ai-reels-inngest-wizard.ts',
      'src/scenes/lipSyncWizard/veed-fabric-wizard.ts',
    ]
    for (const f of wired) {
      expect(
        codeOf(f),
        `${f} tells the person to start over in silence`
      ).toMatch(/await reportDeadEnd\(/)
    }
    // and the i2v file holds BOTH of its dead ends
    expect(
      (codeOf(wired[0]).match(/await reportDeadEnd\(/g) || []).length
    ).toBeGreaterThanOrEqual(2)
  })
})
