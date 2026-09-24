import { describe, expect, it } from 'vitest'
import {
  MAX_LOOKS,
  parseLookOffers,
  stripAgentMarkers,
} from '@/navigation/helpers/actionButtons'
import { lookIntent } from '@/navigation/registerCommands'

/*
 * A CHOICE THE CLIENT TAPS, IN THEIR OWN CHAT.
 *
 * Owner, 2026-09-24: "offer her different looks right in the chat", and make
 * the work there as comfortable as it can be. An open question asks a person
 * to compose a sentence; three taps ask nothing.
 *
 * In a business DM the bot answers AS THE OWNER, where Telegram allows url
 * buttons alone -- so each option is a deep link into the bot, which opens
 * INSIDE Telegram. The number travels; what option 2 WAS is read back from
 * the conversation, which is the only place that knows.
 */
describe('the options an answer offers', () => {
  it('reads the marked options in reading order', () => {
    const answer =
      '1. У доски, тёплый свет\n2. Портрет крупно\n3. За рабочим столом\n' +
      '[[У доски|look:1]] [[Портрет|look:2]] [[За столом|look:3]]'
    expect(parseLookOffers(answer)).toEqual([
      { n: 1, label: 'У доски' },
      { n: 2, label: 'Портрет' },
      { n: 3, label: 'За столом' },
    ])
  })

  it('drops a repeated number instead of showing it twice', () => {
    // Two buttons leading to the same choice is a person picking one and
    // getting the other.
    const twice = '[[Первый|look:1]] [[Тоже первый|look:1]] [[Второй|look:2]]'
    expect(parseLookOffers(twice).map(l => l.n)).toEqual([1, 2])
  })

  it('never offers more than a phone shows without scrolling', () => {
    const many = [1, 2, 3, 4]
      .map(n => `[[Вариант ${n}|look:${n}]]`)
      .concat('[[Пятый|look:4]]')
      .join(' ')
    expect(parseLookOffers(many)).toHaveLength(MAX_LOOKS)
  })

  it('ignores an empty label and a number outside the range', () => {
    expect(parseLookOffers('[[|look:1]]')).toEqual([])
    expect(parseLookOffers('[[Пятый|look:5]]')).toEqual([])
    expect(parseLookOffers('[[Нуль|look:0]]')).toEqual([])
    expect(parseLookOffers('ничего не предложено')).toEqual([])
  })

  it('the person never sees the marker itself', () => {
    /*
     * The skill's own list of complaints starts with "the person sees literal
     * [[…|act:…]] text". A new marker form that only the keyboard builder
     * knew about would put the brackets straight into a client's chat.
     */
    const answer = 'Три варианта:\n1. У доски\n[[У доски|look:1]]'
    const shown = stripAgentMarkers(answer)
    expect(shown).not.toContain('look:')
    expect(shown).not.toContain('[[')
    expect(shown).toContain('У доски')
  })
})

describe('the tap lands somewhere', () => {
  it('reads the number out of the start payload', () => {
    expect(lookIntent('look_2')).toEqual({ n: 2 })
    expect(lookIntent('LOOK_4')).toEqual({ n: 4 })
  })

  it('refuses everything that is not one of the four', () => {
    for (const bad of [
      'look_0',
      'look_5',
      'look_',
      'look_2x',
      'lookup_2',
      '',
      undefined,
    ])
      expect(lookIntent(bad as never), String(bad)).toBeNull()
  })

  it('the payload is HANDLED, not dropped in silence', async () => {
    /*
     * The trap this pins is written down two comments away from the intent in
     * the source: the mini app's paywall opened the bot with
     * `subscribe_<plan>_<method>`, nothing read it, and the person got the
     * ordinary greeting. Nobody saw an error, because from the outside a
     * dropped intent looks exactly like somebody who changed their mind.
     */
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '../../navigation/registerCommands.ts'),
      'utf8'
    )
    // A branch in the /start chain, and something that acts on it.
    expect(src).toMatch(/\}\s*else if \(lookIntent\(startParam\)\)\s*\{/)
    // The phrase the bot sends is Russian, and this repository's guard reads
    // a regex literal as code -- so the check is on the call, not its wording.
    expect(src).toMatch(/runAgentTurnFor\(\s*ctx as never,/)
  })

  it('the choice is quoted as a choice, never as an instruction', () => {
    /*
     * The label was written by a model that had just read a stranger's
     * message. A button's words must not become a command, so the number
     * alone travels and the bot phrases the pick itself.
     */
    expect(lookIntent('look_3')).toEqual({ n: 3 })
  })
})
