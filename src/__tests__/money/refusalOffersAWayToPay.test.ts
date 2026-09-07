import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { sendInsufficientStarsMessage } from '@/price/helpers/sendInsufficientStarsMessage'

/**
 * A REFUSAL THAT NAMES THE PRICE MUST OFFER THE WAY TO PAY IT.
 *
 * The moment a person is told "you asked for a paid thing and the only obstacle
 * is money" is the moment of highest intent to pay in the whole product. The
 * shared helper sent that sentence through `sendMessage(chatId, message)` --
 * two arguments, so no keyboard at all -- and pointed at "the main menu" in
 * PROSE. Writing the next step as a sentence instead of a button is the tell.
 */
describe('the shared money refusal hands over the button, not directions', () => {
  const fakeCtx = () => {
    const sent: any[] = []
    return {
      sent,
      ctx: {
        from: { id: 424242 },
        telegram: {
          sendMessage: vi.fn(async (...args: any[]) => {
            sent.push(args)
            return { message_id: 1 }
          }),
        },
      } as any,
    }
  }

  it('sends the message at all (the control for everything below)', async () => {
    const { ctx, sent } = fakeCtx()
    await sendInsufficientStarsMessage(ctx, 3, true)
    expect(sent).toHaveLength(1)
    expect(String(sent[0][1])).toContain('3')
  })

  it('passes a keyboard, which it did not before', async () => {
    const { ctx, sent } = fakeCtx()
    await sendInsufficientStarsMessage(ctx, 3, true)
    const extra = sent[0][2]
    expect(
      extra,
      'the third argument is the keyboard; two arguments means none'
    ).toBeTruthy()
    expect(extra.reply_markup?.inline_keyboard?.length ?? 0).toBeGreaterThan(0)
  })

  it('puts topping up first, because that is the obstacle it just named', async () => {
    const { ctx, sent } = fakeCtx()
    await sendInsufficientStarsMessage(ctx, 0, true)
    const rows = sent[0][2].reply_markup.inline_keyboard
    expect(JSON.stringify(rows[0])).toContain('act:topup')
  })

  it('works in English too, and still carries the button', async () => {
    const { ctx, sent } = fakeCtx()
    await sendInsufficientStarsMessage(ctx, 7, false)
    expect(String(sent[0][1])).toMatch(/Not enough stars/)
    expect(JSON.stringify(sent[0][2])).toContain('act:topup')
  })

  /**
   * The copy used to say "top up in the main menu". With a button underneath,
   * telling somebody to navigate is worse than saying nothing: it sends them
   * away from the thing that does the job.
   */
  it('no longer sends the person somewhere by hand', async () => {
    const { ctx, sent } = fakeCtx()
    await sendInsufficientStarsMessage(ctx, 1, true)
    expect(String(sent[0][1])).not.toContain('главном меню')
    const { ctx: c2, sent: s2 } = fakeCtx()
    await sendInsufficientStarsMessage(c2, 1, false)
    expect(String(s2[0][1])).not.toContain('main menu')
  })
})

/**
 * THE REST OF THE CLASS, MEASURED RATHER THAN CLAIMED.
 *
 * One helper is fixed; the same shape is written inline in many wizards. This
 * counts them so the number cannot quietly grow, and prints BOTH sides -- a
 * ceiling alone is satisfied by a matcher that stopped matching, which is why
 * the size of the scanned population is asserted too.
 *
 * It is an UPPER BOUND, said plainly: some of these strings are thrown or
 * returned rather than sent to a person, and this cannot tell those apart.
 */
describe('the number of money refusals with nothing to press does not grow', () => {
  const ROOT = path.join(__dirname, '..', '..', '..')
  const PHRASE = new RegExp(
    'Недостаточно\\s+(звезд|средств)|Insufficient\\s+(stars|funds)|Not enough stars',
    'i'
  )
  const NOISE =
    /logger\.|console\.|^\s*\/\/|^\s*\*|description:\s*'Insufficient/
  const isRefusal = (line: string) => PHRASE.test(line) && !NOISE.test(line)

  const measure = () => {
    const files = execSync(
      "grep -rl --include='*.ts' -E 'Недостаточно|Insufficient|Not enough stars' src 2>/dev/null || true",
      { cwd: ROOT }
    )
      .toString()
      .split('\n')
      .filter(Boolean)
      .filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts'))

    const sites: Array<{ file: string; line: number; keyboard: boolean }> = []
    for (const file of files) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
      let prev: number | null = null
      for (let i = 0; i < lines.length; i++) {
        if (!isRefusal(lines[i])) continue
        // The Russian and English halves of one message sit on adjacent lines;
        // counting both would double every site.
        if (prev !== null && i - prev <= 2) {
          prev = i
          continue
        }
        prev = i
        const window = lines.slice(Math.max(0, i - 8), i + 15).join('\n')
        sites.push({
          file,
          line: i + 1,
          keyboard:
            /reply_markup|Markup\.|inline_keyboard|standardButtons|keyboard\(/.test(
              window
            ),
        })
      }
    }
    return sites
  }

  /** Both sides of the matcher, so a dead one cannot pass as progress. */
  it('finds the refusals it claims to count', () => {
    expect(isRefusal('      ? `❌ Недостаточно средств.`')).toBe(true)
    expect(isRefusal("  logger.error('❌ Недостаточно средств', {")).toBe(false)
    expect(isRefusal("await ctx.reply('Балан пополнен')")).toBe(false)
  })

  it('still scans a population of the expected size', () => {
    const sites = measure()
    // A floor, not a ceiling: a matcher that stopped matching would satisfy
    // the debt ceiling below by finding nothing at all.
    expect(sites.length).toBeGreaterThanOrEqual(55)
  })

  it('does not grow the number that offer nothing', () => {
    const sites = measure()
    const mute = sites.filter(s => !s.keyboard)
    expect(
      mute.length,
      `refusals with nothing to press:\n${mute.map(m => `  ${m.file}:${m.line}`).join('\n')}`
    ).toBeLessThanOrEqual(43)
  })

  /**
   * The wizards a paying person actually reaches, closed one batch at a time.
   * Named individually rather than trusted to the count: a ceiling that drops
   * says the number moved, not that these particular screens did.
   */
  it('the wizards where somebody is refused to their face now offer the button', () => {
    const sites = measure()
    const fixed = [
      'aiCoverWizard',
      'faceSwapWizard',
      'musicGenerationWizard',
      'videoTranscriptionWizard',
      'voiceTrainingWizard',
      'ai-reels-inngest-wizard',
      'ai-reels-render-wizard',
      'veed-fabric-wizard',
    ]
    const still = fixed.filter(name =>
      sites.some(s => s.file.includes(name) && !s.keyboard)
    )
    expect(
      still,
      `still refusing with nothing to press: ${still.join(', ')}`
    ).toEqual([])
  })

  it('the shared helper is no longer one of them', () => {
    const sites = measure()
    const helper = sites.find(s =>
      s.file.includes('sendInsufficientStarsMessage')
    )
    expect(
      helper,
      'the helper should still be found by the matcher'
    ).toBeTruthy()
    expect(helper!.keyboard).toBe(true)
  })
})
