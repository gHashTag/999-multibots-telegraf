import { describe, it, expect } from 'vitest'
import { systemPrompt } from './src/agent/chat'
import { TOKEN_PRICES } from './src/agent/billing-shared'
import { TOKEN_START } from './src/agent/tools'

/**
 * A PROMISE MADE TO A STRANGER MUST FIT THE MONEY A STRANGER HAS.
 *
 * The client-facing prompt tells the seller: a request for a picture, a reel
 * or a voice is done STRAIGHT AWAY, because "the starter tokens are there".
 * A person writing to the owner's DM for the first time has exactly the
 * welcome grant -- TOKEN_START, granted once on their first paid action --
 * and nothing else.
 *
 * Three numbers in three files hold that sentence up: the grant, the price of
 * each service, and the list in the prompt. Today a picture is 2, a reel 2, a
 * voice 12, and the grant is 20, so all three fit. Lower the grant or raise a
 * price and the seller promises a stranger something it cannot deliver -- and
 * the stranger finds out AFTER being told it is free.
 *
 * The other direction matters too: video is 40 and is deliberately NOT on
 * that list. If somebody adds it, this test says why not.
 */
describe('what the seller promises a new client fits the welcome grant', () => {
  /** The words the prompt uses, and the tool each one means. */
  const PROMISED: Array<[string, string]> = [
    ['фото', 'image_generate'],
    ['рилс', 'reel_render'],
    ['озвучку', 'audio_generate'],
  ]

  const prompt = systemPrompt('business')

  it('the prompt really makes that promise (a reworded line fails here)', () => {
    const LINE = new RegExp(
      'Просьба сделать ([^.]+) — делай сразу инструментом'
    )
    const m = LINE.exec(prompt)
    expect(
      m,
      'the "do it straight away" promise is gone or reworded'
    ).toBeTruthy()
    for (const [word] of PROMISED) {
      expect(m![1], `the promise no longer names ${word}`).toContain(word)
    }
  })

  it('every promised service costs no more than the grant', () => {
    const tooDear = PROMISED.filter(
      ([, tool]) => TOKEN_PRICES[tool] > TOKEN_START
    ).map(
      ([word, tool]) =>
        `${word} (${tool}): ${TOKEN_PRICES[tool]} > ${TOKEN_START}`
    )
    expect(
      tooDear,
      'the seller promises a stranger something their starter tokens cannot pay for'
    ).toEqual([])
  })

  it('and the expensive one is not promised', () => {
    // video_generate is 40: twice the grant. The promise names it nowhere, and
    // that is the whole reason this case exists.
    expect(TOKEN_PRICES.video_generate).toBeGreaterThan(TOKEN_START)
    const LINE = new RegExp(
      'Просьба сделать ([^.]+) — делай сразу инструментом'
    )
    expect(LINE.exec(prompt)![1]).not.toContain('видео')
  })
})
