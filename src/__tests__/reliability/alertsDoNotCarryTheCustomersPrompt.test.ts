/**
 * THE OWNER'S ALERT CHANNEL IS NOT A PLACE TO PUBLISH WHAT PEOPLE WRITE.
 *
 * 2026-09-15 08:56. One person with a balance of zero tapped one avatar
 * transform. The failure was money -- four stars they did not have -- and the
 * fourth alert it produced arrived in the owner's group carrying their entire
 * creative prompt, several hundred characters of it, because
 * `generateFluxKontext`'s catch-all passes `prompt: params.prompt` and
 * `detailsForAlert` renders every key it is given.
 *
 * The repair is at the choke point rather than at the call site. Around two
 * hundred and fifty `logger.error` calls reach this one function; a rule
 * applied to the sites is a list nobody finishes, and the next site written
 * tomorrow would not know about it. A rule applied here is inherited.
 *
 * Two properties, and the second is not decoration:
 *   1. content keys are reported by SIZE, never by content;
 *   2. no single value may fill the alert -- the old cap was on the finished
 *      blob, so one long value pushed the status code, the provider's answer
 *      and the model off the end. An alert that drops the diagnosis to make
 *      room for a customer's sentence is worse than no alert.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { detailsForAlert, redactSecrets } from '@/utils/logger'
import { withSuppressedCount } from '@/utils/alertThrottle'
import {
  SYNTHETIC_BOT_TOKEN,
  SYNTHETIC_OPENAI_KEY,
} from '../helpers/secretShapes'

const ROOT = path.join(__dirname, '..', '..', '..')

describe('a customer prompt never reaches the alert', () => {
  const PROMPT =
    'a photorealistic portrait of me as a cyberpunk detective in the rain, ' +
    'neon reflections, 85mm lens, cinematic grade, my face clearly visible'

  it('replaces the prompt with its length', () => {
    const d = detailsForAlert({
      error: 'Not enough stars',
      telegram_id: '1613501411',
      prompt: PROMPT,
    })!
    expect(d, 'the prompt itself must not be in the alert').not.toContain(
      'cyberpunk detective'
    )
    expect(d).toContain(`<prompt: ${PROMPT.length} chars>`)
  })

  it('keeps the fact an operator can act on: the error', () => {
    // The point of the alert survives the redaction. A fix that silences the
    // diagnosis along with the prompt would trade one blindness for another.
    const d = detailsForAlert({ error: 'Not enough stars', prompt: PROMPT })!
    expect(d).toContain('Not enough stars')
  })

  it('covers the other names the same content travels under', () => {
    for (const key of [
      'originalPrompt',
      'negativePrompt',
      'promptText',
      'userPrompt',
      'eventData',
      'body',
      'rawBody',
      'requestBody',
      'callbackBody',
    ]) {
      const d = detailsForAlert({ [key]: PROMPT })!
      expect(d, `${key} still carries the content`).not.toContain('cyberpunk')
      expect(d).toContain(`<${key}: ${PROMPT.length} chars>`)
    }
  })

  it('summarises an object under a content key without printing it', () => {
    // Inngest sends the whole event: `eventData: JSON.stringify(event.data)`.
    const d = detailsForAlert({
      eventData: { prompt: PROMPT, telegram_id: '1613501411' },
    })!
    expect(d).not.toContain('cyberpunk')
    expect(d).toMatch(/<eventData: \d+ chars>/)
  })

  it('an empty prompt is still reported, because zero is a diagnosis', () => {
    const d = detailsForAlert({ error: 'boom', prompt: '' })!
    expect(d).toContain('<prompt: 0 chars>')
  })
})

describe('no single value fills the alert', () => {
  it('truncates a long value and says how much was dropped', () => {
    const d = detailsForAlert({ providerAnswer: 'x'.repeat(2000) })!
    expect(d).toMatch(/…\(\+\d+ chars\)/)
    expect(d.length).toBeLessThanOrEqual(1201)
  })

  it('a novel in the first key does not push the diagnosis off the end', () => {
    /*
     * THE CONTROL THAT CAN FAIL. With only the whole-blob cap, the keys after
     * a long value were cut away -- and JSON.stringify preserves insertion
     * order, so whichever key the caller wrote first decided what survived.
     */
    const d = detailsForAlert({
      aVeryTalkativeField: 'y'.repeat(4000),
      status: 402,
      error: 'Not enough stars',
      model: 'seedream-4.5',
    })!
    expect(d, 'the status code was pushed out').toContain('402')
    expect(d, 'the error text was pushed out').toContain('Not enough stars')
    expect(d, 'the model was pushed out').toContain('seedream-4.5')
  })

  it('reports a huge object by shape and size rather than serialising it', () => {
    const d = detailsForAlert({ record: { bytes: Array(4000).fill(255) } })!
    expect(d).toMatch(/<record: \d+ chars>/)
    expect(d).not.toContain('255, 255')
  })

  it('leaves small values exactly as they were', () => {
    // The redaction must be invisible to the ordinary alert, which is most of
    // them. A rule that reshapes every message is a rule that gets reverted.
    const d = detailsForAlert({ status: 400, model: 'grok-2-latest' })!
    expect(d).toContain('"status": 400')
    expect(d).toContain('"model": "grok-2-latest"')
  })
})

describe('a key never reaches the alert, from EITHER half of it', () => {
  /*
   * The redaction lived at the bottom of `detailsForAlert`, so it scrubbed the
   * meta blob and the message went out verbatim -- and the message is the half
   * that is always sent. Twenty-three alert titles here are template literals
   * built from an upstream error body:
   *
   *   `❌ Ошибка ${endpoint}: ${response.status} - ${errorText}`
   *
   * and a 401 body habitually quotes back the credential it rejected. The
   * owner's alert group has ordinary members in it.
   */
  const SAMPLES: Array<[string, string]> = [
    ['an OpenAI key', `Incorrect API key provided: ${SYNTHETIC_OPENAI_KEY}`],
    ['an xAI key', 'auth failed for xai-9ZyXwVuTsRqPoNmLkJiHgFeD'],
    ['a Replicate token', 'unauthorized: r8_QwErTyUiOpAsDfGhJkLzXcVbN'],
    ['a GitHub token', 'bad credentials ghp_1234567890abcdefghijKLMNOP'],
    ['a bot token', `getMe failed for ${SYNTHETIC_BOT_TOKEN}`],
  ]

  it.each(SAMPLES)('scrubs %s out of the message', (_what, text) => {
    const cleaned = redactSecrets(text)
    const secret = text.split(/[\s:]+/).pop()!
    expect(cleaned, `the raw value survived: ${cleaned}`).not.toContain(secret)
  })

  it.each(SAMPLES)('scrubs %s out of the details too', (_what, text) => {
    const d = detailsForAlert({ providerError: text })!
    const secret = text.split(/[\s:]+/).pop()!
    expect(d).not.toContain(secret)
  })

  it('still says what happened, so the alert keeps its point', () => {
    const cleaned = redactSecrets(
      `Incorrect API key provided: ${SYNTHETIC_OPENAI_KEY}`
    )
    expect(cleaned).toContain('Incorrect API key provided')
    expect(cleaned).toContain('<key>')
  })

  it('leaves ordinary text alone', () => {
    // A scrubber that eats the diagnosis is the same blindness by another road.
    const plain = 'Ошибка Supabase: connection refused after 3 attempts'
    expect(redactSecrets(plain)).toBe(plain)
  })

  it('the delivery path uses it on the message, not only on the meta', () => {
    // The wiring, not just the helper: a scrubber nobody calls is decoration.
    const src = fs.readFileSync(path.join(ROOT, 'src/utils/logger.ts'), 'utf8')
    expect(src).toMatch(/error:\s*redactSecrets\(message\)/)
  })
})

describe('the count survives a long alert', () => {
  /*
   * `logError` kept the first 500 characters of a title and dropped the rest.
   * The throttle appends its tally to the END -- "(+47 more in the last 10
   * min)" -- which is the single thing that makes suppression honest instead of
   * muting. Any title long enough to be cut lost exactly that, and it was lost
   * precisely in the storms where the number is the whole message.
   */
  it('elides the middle and keeps the tail', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/services/telegram-log.service.ts'),
      'utf8'
    )
    expect(src, 'the old head-only cut is back').not.toMatch(
      /errorMessage\.substring\(0,\s*500\)\s*\+\s*'\.\.\.'/
    )
    expect(src).toContain('errorMessage.slice(-TAIL)')
  })

  it('withSuppressedCount puts the number where the tail keeps it', () => {
    const long = 'x'.repeat(2000)
    const withCount = withSuppressedCount(long, 47)
    expect(withCount.endsWith('то же самое)')).toBe(true)
    expect(withCount).toContain('+47')
  })
})

describe('the site that leaked it still says what happened', () => {
  /*
   * The call site keeps passing `prompt`, on purpose: the length is worth
   * having, and routing the decision through one function is the whole point.
   * This pins that the leaking site is still wired to the guarded path rather
   * than having quietly grown its own formatter.
   */
  it('generateFluxKontext logs through logger, not through a bespoke sender', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/services/generateFluxKontext.ts'),
      'utf8'
    )
    expect(src).toContain("'FLUX Kontext editing failed'")
    expect(src).toContain("from '@/utils/logger'")
  })
})
