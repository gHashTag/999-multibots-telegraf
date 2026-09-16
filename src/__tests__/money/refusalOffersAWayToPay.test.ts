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
  /*
   * A THROWN STRING IS NOT A MESSAGE, AND NEITHER IS A CONDITION.
   *
   * Classified all 34 by hand on 2026-09-08: ten are not messages to anybody.
   * Five are `throw new Error('Not enough stars')` -- a signal to the caller,
   * which then decides what to tell the person. Two are conditions testing
   * whether an error WAS that (`error.message.includes('Not enough stars')`).
   * Two are fixtures. Counting them as "refusals with nothing to press" is how
   * this number stayed loose enough to absorb three real repairs without
   * moving, twice.
   *
   * Narrowing is the dangerous direction, so every exclusion below has a
   * fixture in both directions in the test named after it, and the population
   * floor stays where it is.
   */
  const THROWN = /\bthrow\s+new\s+\w*Error\s*\(/
  const CONDITION =
    /^\s*(?:\}\s*else\s+)?if\s*\(|\.includes\s*\(|^\s*[!&|]{1,2}\s*\w/
  /*
   * THE SENTINEL'S DECLARATION IS NOT A REFUSAL, IT IS THE PROTOCOL.
   *
   * `throw new Error('Not enough stars')` was already excluded above as a
   * signal to the caller. Those five throws have since been replaced by one
   * exported constant that the shared helper throws and five catch sites match
   * -- so the exact text this rule exists to exclude moved from five excluded
   * lines to one counted line, and the count went UP by one while the product
   * got strictly better. Counting a protocol constant as a refusal with
   * nothing to press would make this number measure the refactor rather than
   * the product.
   *
   * Kept as narrow as the thing it describes: an exported SCREAMING_SNAKE name
   * bound to a bare string literal and nothing else on the line. A real
   * refusal has a ternary, a template, an interpolation, or a lowercase name
   * -- the survivors below pin every one of those.
   */
  const SENTINEL_DECL =
    /^\s*(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\s*=\s*'[^']*'\s*$/
  const isRefusal = (line: string) =>
    PHRASE.test(line) &&
    !NOISE.test(line) &&
    !THROWN.test(line) &&
    !SENTINEL_DECL.test(line) &&
    !CONDITION.test(line)

  /** Blank out comments, keeping newlines so the window still lines up. */
  const stripComments = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
      .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

  const measure = () => {
    const files = execSync(
      "grep -rl --include='*.ts' -E 'Недостаточно|Insufficient|Not enough stars' src 2>/dev/null || true",
      { cwd: ROOT }
    )
      .toString()
      .split('\n')
      .filter(Boolean)
      .filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts'))
      // Fixtures describe payments that never happened; `test/fixtures` does
      // not match the `__tests__` filter above.
      .filter(
        f =>
          !/\/(?:test|__fixtures__)\/fixtures?\//.test(f) &&
          !/fixtures?\.ts$/.test(f)
      )

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
        /*
         * THE WINDOW IS READ AS CODE, NOT AS PROSE.
         *
         * This asked whether the word `standardButtons` appears near the
         * refusal. It does not distinguish a call from a COMMENT -- and the
         * comments added while fixing four of these sites each explain that
         * standardButtons now carries the button, so every site in those files
         * flipped to "has keyboard" on the strength of the explanation. The
         * count fell from 43 to 38 and reverting any single fix changed
         * nothing, which is how the prose was caught.
         *
         * A quotation is not an invocation. Comments are blanked first.
         */
        /*
         * FOLLOW THE VARIABLE TO WHERE IT IS SENT.
         *
         * A window around the refusal line only sees the keyboard when the
         * message is built and sent in the same breath. In generateFluxKontext
         * the text is assigned at :552 and sent at :590 -- thirty-eight lines
         * away, in a shared error handler. Attaching standardButtons there is
         * a real repair that this matcher could not see: three fixes moved the
         * count by ZERO, which is the tell.
         *
         * So when the refusal is assigned to a name, the windows around every
         * send of that name join the search. Still an upper bound, and now a
         * tighter one.
         */
        // The assignment can sit three lines up: `x = isRu` / `? 'ru'` / `: 'en'`,
        // and the adjacent-line rule lands this loop on either half. Looking
        // back one line found nothing and the count did not move -- the tell
        // that the lookback, not the idea, was wrong.
        let assigned = null
        for (let back = 0; back <= 3 && !assigned; back++)
          assigned = /(\w+)\s*=\s*(?:$|[`'"]|\w)/.exec(lines[i - back] || '')
        let window = stripComments(
          lines.slice(Math.max(0, i - 8), i + 15).join('\n')
        )
        const name = assigned && (assigned[1] || assigned[2])
        if (name) {
          for (let k = 0; k < lines.length; k++) {
            if (
              !new RegExp(`sendMessage\\([\\s\\S]{0,120}?\\b${name}\\b`).test(
                lines.slice(k, k + 6).join('\n')
              )
            )
              continue
            window +=
              '\n' +
              stripComments(lines.slice(Math.max(0, k - 4), k + 12).join('\n'))
          }
        }
        sites.push({
          file,
          line: i + 1,
          /*
           * REMOVING A KEYBOARD IS NOT OFFERING ONE, and the old predicate
           * could not tell them apart: `reply_markup: { remove_keyboard: true }`
           * contains the string `reply_markup`, so a message that strips the
           * keyboard counted as answering. That is how three real repairs in
           * generateFluxKontext moved this number by ZERO -- the sites were
           * already scored as answered while the person had nothing to press.
           */
          keyboard: (() => {
            const w = window.replace(
              /reply_markup:\s*\{\s*remove_keyboard[\s\S]{0,40}?\}/g,
              ' '
            )
            return /reply_markup|Markup\.|inline_keyboard|standardButtons|keyboard\(/.test(
              w
            )
          })(),
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

  it('counts messages to a person, and not throws, conditions or fixtures', () => {
    /*
     * EVERY EXCLUSION, IN BOTH DIRECTIONS. Narrowing a population is how a
     * number is made to look better without anything improving, so each thing
     * dropped is named here with a counter-example that must stay.
     */
    // A thrown string is a signal to the caller, not a message to anybody.
    expect(isRefusal("        throw new Error('Not enough stars')")).toBe(false)
    // A test for whether an error WAS that is not the refusal either.
    expect(
      isRefusal(
        "      if (error.message && error.message.includes('Not enough stars')) {"
      )
    ).toBe(false)
    expect(
      isRefusal("        !errorMessageToUser.includes('Not enough stars')")
    ).toBe(false)
    // The sentinel's one declaration: a protocol constant, not a sentence.
    expect(
      isRefusal("export const INSUFFICIENT_FUNDS_SENTINEL = 'Not enough stars'")
    ).toBe(false)

    // AND THE THINGS THAT MUST SURVIVE. Without these the rules above would be
    // satisfied by a matcher that dropped everything.
    expect(isRefusal('      ? `❌ Недостаточно звезд для генерации.`')).toBe(
      true
    )
    expect(
      isRefusal("        : '❌ Not enough stars for image editing.'")
    ).toBe(true)
    expect(
      isRefusal('      const errorMsg = `Недостаточно средств. Баланс: ${b}`')
    ).toBe(true)

    // THE SENTINEL EXCLUSION, PUSHED ON. It is the newest and therefore the
    // least trusted rule here; these are the shapes a real refusal takes that
    // it must not swallow.
    expect(
      isRefusal("  const message = 'Недостаточно средств на балансе'"),
      'a lowercase name is an ordinary variable holding a sentence'
    ).toBe(true)
    expect(
      isRefusal("  const MESSAGE = 'Not enough stars' + suffix"),
      'anything past the literal means it is being built, not declared'
    ).toBe(true)
    expect(
      isRefusal('  const MSG = `Недостаточно звезд: ${n}`'),
      'a template with an interpolation is a sentence about this person'
    ).toBe(true)
  })

  it('scores a removed keyboard as no keyboard, and a real one as a keyboard', () => {
    /*
     * A CEILING CANNOT CATCH A LOOSENED DETECTOR: scoring more sites as
     * "answered" only makes the number smaller, and smaller passes. This is the
     * control that can fail.
     *
     * It exists because the predicate matched the literal `reply_markup`, and
     * `reply_markup: { remove_keyboard: true }` contains it -- so a message
     * that STRIPS the keyboard scored as offering one. Three real repairs in
     * generateFluxKontext therefore moved the count by zero.
     */
    const score = (w: string) =>
      /reply_markup|Markup\.|inline_keyboard|standardButtons|keyboard\(/.test(
        w.replace(/reply_markup:\s*\{\s*remove_keyboard[\s\S]{0,40}?\}/g, ' ')
      )
    expect(
      score(
        'await ctx.telegram.sendMessage(id, msg, { reply_markup: { remove_keyboard: true } })'
      ),
      'removing the keyboard is not offering one'
    ).toBe(false)
    expect(
      score('await ctx.telegram.sendMessage(id, msg, standardButtons(isRu))'),
      'the shared top-up keyboard must still score as answered'
    ).toBe(true)
    expect(
      score(
        'await ctx.reply(msg, { reply_markup: { inline_keyboard: rows } })'
      ),
      'a real inline keyboard must still score as answered'
    ).toBe(true)
  })

  it('still scans a population of the expected size', () => {
    const sites = measure()
    // A floor, not a ceiling: a matcher that stopped matching would satisfy
    // the debt ceiling below by finding nothing at all.
    // Was 55, when the population still counted throws, conditions and
    // fixtures. Narrowing to real messages took it to 49, and the floor moves
    // with it ONCE, together with the fixtures below that pin what was excluded
    // and what was not. A floor lowered every time it fires is not a floor.
    expect(sites.length).toBeGreaterThanOrEqual(45)
  })

  it('does not grow the number that offer nothing', () => {
    const sites = measure()
    const mute = sites.filter(s => !s.keyboard)
    expect(
      mute.length,
      // 17, bisected: fails at 16, passes at 17. Was 25, and this time the
      // drop is REPAIRS -- seven sites that sent a refusal with no keyboard now
      // send standardButtons. The first iteration in three where fixing things
      // moved the number, which is what a population of real messages buys.
      //
      // A LIMIT WORTH STATING: this follows a message to a send in the SAME
      // file. When the refusal is RETURNED and sent two files away, a real
      // repair leaves this number untouched -- see
      // refusalReachesTheCaller.test.ts, which pins one by name because the
      // count could not.
      //
      // What is left is three shapes, none of which a keyboard argument fixes:
      // the text is RETURNED to a caller (directPayment, balanceHelpers,
      // bot-adapter, priceHelper x2, generateTextToVideo), it is a CONSTANT
      // somebody else renders (balance.interface), or the nearby reply is a
      // different message entirely (the statusMessage shapes).
      //
      // 17 -> 14: three services that refuse for want of stars now hand over
      // the button (NanoBanana, Seedream45Replicate, NanoBananaProReplicate).
      // Only three, although five carry that exact refusal: the other two,
      // generateGeminiImage and generateNanoBananaKie, are files nothing calls
      // -- chargeSiteCensus already declares them unreferenced. Repairing them
      // would move this number without moving anything a person can reach, and
      // a count that credits dead code is worth less than a smaller honest one.
      //
      // TIGHT, and it has to be: a ceiling one above the real figure cannot see
      // a regression of one. Bisected with the CORRECTED classifier on both
      // sides -- clean main fails at 42, this branch fails at 37 and passes at
      // 38. Measuring the two sides with different instruments is how the first
      // version of this claim came out wrong.
      //
      // 14 -> 13, and the ceiling comes down WITH it: services/imageUpscaler.ts
      // was the fourteenth. Its catch-all told a person short of stars exactly
      // that and sent `remove_keyboard: true` with it -- the one screen where
      // somebody is most willing to pay, and the only one with nothing to press.
      // It now sends standardButtons. Measured, not assumed: the list this
      // message prints came back with thirteen named sites, none of them in
      // services/imageUpscaler.ts, so a ceiling of 14 would no longer see the
      // repair being undone.
      `refusals with nothing to press:\n${mute.map(m => `  ${m.file}:${m.line}`).join('\n')}`
    ).toBeLessThanOrEqual(13)
  })

  /**
   * The wizards a paying person actually reaches, closed one batch at a time.
   * Named individually rather than trusted to the count: a ceiling that drops
   * says the number moved, not that these particular screens did.
   */
  it('the wizards where somebody is refused to their face now offer the button', () => {
    const sites = measure()
    const fixed = [
      // Closed 2026-09-08. All four named "the main menu" IN WORDS and sent no
      // keyboard -- the same shape the shared helper had. The copy no longer
      // names a destination, because standardButtons puts one under the message.
      'processBalanceOperation',
      'generateSeeDream4',
      'generateSeeDream45',
      'aiCoverWizard',
      'faceSwapWizard',
      'musicGenerationWizard',
      'videoTranscriptionWizard',
      'voiceTrainingWizard',
      'ai-reels-inngest-wizard',
      'ai-reels-render-wizard',
      'veed-fabric-wizard',
      // Closed 2026-09-16. The standalone upscaler's catch-all stripped the
      // keyboard on the way out. Named by its directory so this pins the
      // service and not the wizard that calls it.
      'services/imageUpscaler',
    ]
    const still = fixed.filter(name =>
      sites.some(s => s.file.includes(name) && !s.keyboard)
    )
    expect(
      still,
      `still refusing with nothing to press: ${still.join(', ')}`
    ).toEqual([])
  })

  it('the three flux refusals send the button instead of removing the keyboard', () => {
    /*
     * NAMED, BECAUSE THE COUNT CANNOT SEE THEM. All three build the message in
     * a shared error handler and send it thirty-odd lines later, where
     * replyMarkup defaults to `{ remove_keyboard: true }` -- so a person short
     * of stars was left with the keyboard STRIPPED. The repair sets a flag on
     * the money branch and swaps that default for standardButtons.
     *
     * Order is the property: a flag set after the send guards nothing.
     */
    const src = fs
      .readFileSync(
        path.join(ROOT, 'src/services/generateFluxKontext.ts'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
      .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

    const flags = (src.match(/refusedForMoney = true/g) || []).length
    expect(flags, 'each money branch must raise the flag').toBe(3)

    const uses = (src.match(/refusedForMoney\s*\?/g) || []).length
    expect(uses, 'each send must consult it').toBe(3)

    expect(
      (src.match(/standardButtons\(params\.is_ru\)/g) || []).length,
      'and each must lead to the shared top-up keyboard'
    ).toBe(3)

    // The flag must be raised before it is read, in every handler.
    // A literal search fails here: prettier puts the `?` on its own line, so
    // 'refusedForMoney ?' never appears as typed. Search the shape, not the text.
    const nextMatch = (re: RegExp, at: number) => {
      const m = re.exec(src.slice(at))
      return m ? at + m.index : -1
    }
    let from = 0
    for (let n = 0; n < 3; n++) {
      const set = src.indexOf('refusedForMoney = true', from)
      const use = nextMatch(/refusedForMoney\s*\?/, set)
      expect(set, `handler ${n + 1}: flag not set`).toBeGreaterThan(-1)
      expect(
        use,
        `handler ${n + 1}: flag never read after being set`
      ).toBeGreaterThan(set)
      from = use
    }
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
