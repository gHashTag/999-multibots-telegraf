import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A NUMBER THE BOT PROMISES MUST BE THE NUMBER THE CODE USES.
 *
 * Three sentences tell the owner how long something lasts:
 *
 *   "Молчу в этом чате 30 минут"        -> OWNER_TAKEOVER_MS
 *   "30 дней не трогаем"                -> REFUSAL_HOLDS_DAYS
 *   "Вернётся в список через две недели" -> LATER_RETURNS_AFTER_DAYS
 *
 * Each pair lives in two places, and two of the three are in a different
 * service: the strings are in the bot, the windows are in the render's CRM.
 * Nothing held them together. Change a window and the bot keeps promising
 * last month's number -- the same shape as a message naming a command nobody
 * registered, which this repository shipped and had to fix.
 *
 * Checked today: all three agree. This test exists so that stays true.
 */
describe('what the bot promises is what the code does', () => {
  const root = path.join(__dirname, '..', '..')
  const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
  const renderFile = (p: string) =>
    fs.readFileSync(
      path.join(
        root,
        '..',
        'apps',
        'vibee-editor',
        'render',
        'src',
        'agent',
        p
      ),
      'utf8'
    )

  /** The one number in a `const NAME = <n>` line, wherever it lives. */
  const constant = (src: string, name: string): number => {
    const m = new RegExp(
      'const ' +
        name +
        '(?::[^=]+)? = ([0-9]+)(?: \\* ([0-9]+))?(?: \\* ([0-9]+))?'
    ).exec(src)
    expect(m, `${name} was not found where this test expects it`).toBeTruthy()
    return [m![1], m![2], m![3]]
      .filter(Boolean)
      .map(Number)
      .reduce((a, b) => a * b, 1)
  }

  const commands = read('navigation/registerCommands.ts')

  it('the takeover pause: the minutes in the message are the minutes in the code', () => {
    const ms = constant(
      read('services/businessBotService.ts'),
      'OWNER_TAKEOVER_MS'
    )
    const minutes = ms / 60_000
    expect(
      commands,
      `the bot promises a different number of minutes than ${minutes}`
    ).toContain(`Молчу в этом чате ${minutes} минут`)
  })

  it('a refusal: the days in the message are REFUSAL_HOLDS_DAYS', () => {
    const days = constant(renderFile('crm-stages.ts'), 'REFUSAL_HOLDS_DAYS')
    expect(
      commands,
      `the bot promises a hold other than ${days} days`
    ).toContain(`${days} дней не трогаем`)
  })

  it('the refusal window is the same in the BUTTON and in the brief', () => {
    /*
     * The same number is promised in three places, and one of them is not a
     * message to a person at all: the sweep brief tells the MODEL "a refusal
     * within 30 days means write nothing". A window changed in the render
     * would leave the model briefed with last month's rule and quietly
     * proposing cards for people who said no.
     */
    const days = constant(renderFile('crm-stages.ts'), 'REFUSAL_HOLDS_DAYS')
    expect(
      read('navigation/helpers/crmMenu.ts'),
      `the confirm button offers a hold other than ${days} days`
    ).toContain(`отказ на ${days} дней`)
    expect(
      read('services/crmSweepScope.ts'),
      `the sweep brief tells the model a window other than ${days} days`
    ).toContain(`отказ за ${days} дней`)
  })

  it('the refusal window is the same everywhere the MODEL is told it', () => {
    /*
     * FOUR MORE PLACES, ALL OF THEM BRIEFS.
     *
     * `tri promises` found them: the refusal window is stated to the model in
     * the two crm_leads tool descriptions and twice in the playbook, none of
     * which this test read. The model is what decides whom to propose, so a
     * stale window there is worse than a stale sentence to the owner: he
     * would notice, the model will not.
     */
    const days = constant(renderFile('crm-stages.ts'), 'REFUSAL_HOLDS_DAYS')
    const briefs: Array<[string, string]> = [
      ['crm-memory-tools.ts', `отказался за ${days} дней`],
      ['crm-memory-tools.ts', `отказ за ${days} дней`],
      ['crm-playbook.ts', `не возвращайся ${days} дней`],
      ['crm-playbook.ts', `Отказ за ${days} дней`],
    ]
    for (const [file, phrase] of briefs) {
      expect(
        renderFile(file),
        `${file} briefs the model with a window other than ${days} days`
      ).toContain(phrase)
    }
  })

  it('"later": the words in the message are LATER_RETURNS_AFTER_DAYS', () => {
    // Prose, not digits: the sentence says "two weeks". Spelled out here so a
    // change to the window fails loudly instead of quietly making the bot lie.
    const WORDS: Record<number, string> = {
      7: 'неделю',
      14: 'две недели',
      21: 'три недели',
    }
    const days = constant(
      renderFile('crm-segments.ts'),
      'LATER_RETURNS_AFTER_DAYS'
    )
    const said = WORDS[days]
    expect(
      said,
      `nobody has written how to say ${days} days in the message -- add it here and in the bot`
    ).toBeTruthy()
    expect(commands).toContain(`Вернётся в список через ${said}`)
  })

  it('finds the constants at all (a broken reader fails, not passes)', () => {
    // Positive control: without this a typo in a name would make every check
    // above pass on an undefined it never compared.
    expect(
      constant(read('services/businessBotService.ts'), 'OWNER_TAKEOVER_MS')
    ).toBe(30 * 60 * 1000)
    expect(constant(renderFile('crm-stages.ts'), 'REFUSAL_HOLDS_DAYS')).toBe(30)
    expect(
      constant(renderFile('crm-segments.ts'), 'LATER_RETURNS_AFTER_DAYS')
    ).toBe(14)
  })
})
