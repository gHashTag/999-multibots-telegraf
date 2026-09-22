import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  FALLBACK_BUTTON_IDS,
  fallbackSystemPrompt,
} from '@/navigation/helpers/agentFallback'
import { isKnownAction } from '@/navigation/helpers/actionButtons'
import { CAPABILITIES } from '@/services/capabilityPreflight'

/**
 * THE FALLBACK PROMPT TELLS THE TRUTH ABOUT MONEY -- ALL OF IT.
 *
 * Twice this prompt carried a hand-written fact that the product had moved
 * past. First four tariffs that never existed ("Free, Basic 299, Pro 699,
 * Studio 1999"), which the model repeated to every new person. Their
 * replacement said "there are no tariffs and no subscriptions" -- and this
 * very test pinned that sentence in place. It became false the day the club
 * became the one subscription (owner's rule, 2026-09-22), and on the same day
 * the toolless fallback answered a person in production with it in its prompt.
 *
 * So the guards run in both directions now: no tariff and no price, AND never
 * again a claim that there is no subscription or no club. The prompt is read
 * as the model receives it, in both languages, from the one builder the bot
 * calls -- not sliced out of a source file.
 */
const RU = fallbackSystemPrompt(true)
const EN = fallbackSystemPrompt(false)
const BOTH = [
  ['ru', RU],
  ['en', EN],
] as const

// Built from strings: the Cyrillic gate allows Cyrillic in literals only.
// Up to three words may stand between the noun and the negation: review of
// #2844 showed natural Russian word order and "We do not sell any subscriptions"
// both walking past the narrower patterns with all 48 tests green.
const DENIES_A_SUBSCRIPTION = [
  new RegExp(
    '(подписок|подписки|подписка|тарифов|клуба|клуб)(\\s+[^\\s.;!?]+){0,3}?\\s+(нет|не существует|отсутству)',
    'iu'
  ),
  new RegExp('(^|\\s)нет\\s+(никаких\\s+|ни\\s+)?(подпис|тариф|клуб)', 'iu'),
  /\bno\s+(\w+\s+)?(subscriptions?|plans?|tariffs?|club|membership)\b/i,
  /\b(subscriptions?|plans?|tariffs?|club)\s+(do(es)?\s+not|don't|doesn't)\s+exist/i,
  /\bthere\s+(is|are)\s+no\s+(\w+\s+)?(subscriptions?|plans?|tariffs?|club)/i,
  /\b(do(es)?\s+not|don't|doesn't)\s+(sell|have|offer)\s+(any\s+)?(subscriptions?|plans?|tariffs?|club|membership)/i,
]

describe('the toolless fallback prompt', () => {
  it('the guard is not blind: it catches the sentences that were shipped', () => {
    // Negative control -- the prompt as it read up to 2026-09-22, and the
    // same claim in English. If these pass the guard, the guard proves nothing.
    for (const said of [
      'Как устроена оплата: тарифов и подписок НЕТ — есть токены.',
      'Подписок нет, есть токены.',
      'There are no plans or subscriptions, only tokens.',
      'We have no subscriptions.',
      // The two mutants of the #2844 review, in ordinary word order.
      'Подписок у нас нет, только токены; про клуб ответит /club.',
      'We do not sell any subscriptions, only tokens; the /club command answers about the club.',
    ])
      expect(
        DENIES_A_SUBSCRIPTION.some(re => re.test(said)),
        said
      ).toBe(true)
  })

  for (const [lang, prompt] of BOTH) {
    it(`${lang}: never claims there is no subscription or no club`, () => {
      for (const re of DENIES_A_SUBSCRIPTION) expect(prompt).not.toMatch(re)
    })

    it(`${lang}: says the club exists and sends the person to /club for it`, () => {
      expect(prompt).toMatch(new RegExp('клуб|club', 'i'))
      expect(prompt).toContain('/club')
    })

    it(`${lang}: names no tariff and no price -- prices live in the cashier`, () => {
      for (const word of ['Basic', 'Pro (', 'Studio', 'Free (', '₽'])
        expect(prompt).not.toContain(word)
      // Any number of three or more digits here is a price typed by hand; the
      // club's own "10 000" is the one most likely to creep back in.
      expect(prompt).not.toMatch(/\d[\d\s.,]{2,}\d/)
      expect(prompt).not.toMatch(/\d{3,}/)
    })

    it(`${lang}: names the real model -- tokens bought with Stars`, () => {
      expect(prompt).toMatch(new RegExp('токен|token', 'i'))
      expect(prompt).toMatch(new RegExp('звёзд|Stars', 'i'))
    })

    it(`${lang}: names every way to pay the top-up button opens, not Stars alone`, () => {
      // Review of #2844: the top-up chooser offers Stars, rubles and crypto
      // (actionButtons.ts, pay_rub / pay_crypto). With "never invent anything
      // not in this prompt", a Stars-only line made the fallback tell a person
      // asking about rubles that only Stars work.
      expect(prompt).toMatch(new RegExp('рубл|rubles', 'i'))
      expect(prompt).toMatch(new RegExp('крипт|crypto', 'i'))
    })

    it(`${lang}: forbids inventing services and says it has no tools`, () => {
      expect(prompt).toMatch(new RegExp('не выдумывай|never invent', 'i'))
      expect(prompt).toMatch(new RegExp('без инструментов|without tools', 'i'))
    })
  }

  it('offers only button ids somebody handles', () => {
    for (const id of FALLBACK_BUTTON_IDS)
      expect(isKnownAction(id), id).toBe(true)
    for (const [, prompt] of BOTH) {
      const listed = prompt.match(/act:id\]\][^:]*:\s*([a-z_, ]+)\./)
      expect(listed, 'the prompt lists the ids').toBeTruthy()
      const ids = listed![1].split(',').map(x => x.trim())
      expect(ids).toEqual([...FALLBACK_BUTTON_IDS])
    }
  })

  /*
   * The capability list used to be prepended, and its one entry in production
   * -- the Instagram breakdown, whose key the bot service does not have --
   * came back to a person as "I don't have Instagram analytics services
   * available", about a question that had nothing to do with Instagram. The
   * prompt names no service at all, whatever the environment lacks.
   */
  it('names no individual service, so a small model has none to grab', () => {
    for (const [, prompt] of BOTH) {
      expect(prompt).not.toMatch(/instagram/i)
      for (const c of CAPABILITIES) expect(prompt).not.toContain(c.name)
    }
  })
})

/**
 * THE SAME CLAIM MUST NOT COME BACK AROUND THE BUILDER.
 *
 * The prompt used to be a literal inside registerCommands.ts. A second inline
 * prompt there would bypass every guard above, so the code of that file --
 * comments stripped, since the story of the removed sentence belongs in them
 * -- carries neither the sentence nor a system prompt of its own.
 */
describe('registerCommands.ts', () => {
  const CODE = fs
    .readFileSync(
      path.join(process.cwd(), 'src/navigation/registerCommands.ts'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('does not deny the subscription anywhere in its code', () => {
    for (const re of DENIES_A_SUBSCRIPTION) expect(CODE).not.toMatch(re)
  })

  it('takes the fallback prompt from the builder, not from an inline literal', () => {
    expect(CODE).toContain('fallbackMessages(')
    expect(CODE).not.toMatch(/role:\s*'system'/)
  })

  it('/club, which the prompt points to, is a registered command', () => {
    expect(CODE).toMatch(/bot\.command\(\['club'/)
  })
})
