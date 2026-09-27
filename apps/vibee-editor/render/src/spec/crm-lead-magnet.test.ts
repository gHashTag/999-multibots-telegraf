import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as SPEC from './crm-lead-magnet.gen'
import {
  LEAD_MAGNET,
  giftAllowed,
  giftCaption,
  sizeFor,
} from '../agent/crm-deliver-tool'
import {
  PORTRAIT_FRAMING_SUFFIX,
  PORTRAIT_IDENTITY_PREFIX,
  clientFace,
} from '../agent/client-face'
import {
  GPT_IMAGE_25_EDIT_MODELS,
  LEAD_MAGNET_MODEL,
  LEAD_MAGNET_RESOLUTION,
  editInputFor,
} from '../kie-image'
import {
  OPERATION_COST_USD,
  TOKEN_PRICES,
  tokensForCostUsd,
} from '../agent/billing-shared'
import { СЕБЕСТОИМОСТЬ_USD } from '../agent/kie-prices.generated' // cyrillic-ok: generated table name

/**
 * THE LEAD MAGNET IS WRITTEN IN t27 FIRST (owner, 2026-09-27: "make the specs
 * the standard by default").
 *
 * gHashTag/t27 specs/automation/crm-lead-magnet.t27 is the spec of record,
 * vendored here byte for byte beside its `t27c gen-ts` output. That the two
 * agree, that the spec keeps t27's laws, and that no host file restates its
 * numbers is checked for EVERY vendored spec by scripts/check-t27-specs.mjs
 * (run by specs-of-record.test.ts). This file does the part only a person can
 * write: each `test` block of the spec, run against the HOST.
 *
 * v2 was written from an audit of v1 against the code (2026-09-27): v1 promised
 * a text-to-image fallback the owner had removed, called a model "never run"
 * that had run, and held a safe zone and a one-gift rule nothing implemented.
 *
 * Refresh: node scripts/sync-t27-spec.mjs <t27 checkout> automation/crm-lead-magnet
 */
const HERE = __dirname
const ONE_FACE = 'Женщина улыбается, крупный план лица' // cyrillic-ok: a vision description

/** clientFace with the three facts face_for is written in. */
async function faceFrom(named: boolean, avatar: boolean, sentFace: boolean) {
  const sent = sentFace || named ? [{ url: 'S', transcript: ONE_FACE }] : []
  const f = await clientFace(
    {},
    { id: '900000202' },
    {
      avatar: async () => (avatar ? 'A' : ''),
      sentPhotos: async () => sent,
    },
    { photoUrl: named ? 'S' : null }
  )
  if (!f || 'refused' in f) return SPEC.FACE_NONE
  return f.from === 'sent' ? SPEC.FACE_SENT : SPEC.FACE_AVATAR
}

describe("the spec's tests hold against the host", () => {
  it("the gift is drawn from the person's own face at 9:16 and the recipient pays nothing", async () => {
    // face_for(named_sent_ok, has_avatar, has_sent_face)
    expect(await faceFrom(false, true, false)).toBe(SPEC.FACE_AVATAR)
    expect(await faceFrom(true, true, false)).toBe(SPEC.FACE_SENT)
    expect(await faceFrom(false, false, true)).toBe(SPEC.FACE_SENT)
    expect(LEAD_MAGNET.aspectRatio).toBe(SPEC.ASPECT_RATIO)
    expect(LEAD_MAGNET.model).toBe(SPEC.MODEL)
    expect(LEAD_MAGNET.op).toBe(SPEC.OP)
    expect(SPEC.PAYER).toBe('owner')
    expect(SPEC.RECIPIENT_CHARGED).toBe(false)
    expect(SPEC.CHARGE_DEFERRED).toBe(false)
    // No words in the pixels: the framing forbids them.
    expect(SPEC.TEXT_IN_IMAGE).toBe(false)
    expect(PORTRAIT_FRAMING_SUFFIX).toMatch('no text')
  })

  it('with no face of theirs nothing is drawn: one line asks for a photo', async () => {
    expect(await faceFrom(false, false, false)).toBe(SPEC.FACE_NONE)
    expect(SPEC.DRAWN_WITHOUT_FACE).toBe(false)
    expect(SPEC.FALLBACK).toBe('ask-for-photo')
    // The host has no text-to-image door for a person: the delivery tool
    // answers need_photo (a-portrait-is-given-once.test.ts runs it).
    const tool = readFileSync(
      join(HERE, '..', 'agent', 'crm-deliver-tool.ts'),
      'utf8'
    )
    expect(tool).toContain('need_photo: true')
  })

  it('one portrait per person is a gift; the second is paid, or the reel', () => {
    // gift_allowed(portraits_given); the handler is run in
    // a-portrait-is-given-once.test.ts.
    expect(SPEC.GIFTS_PER_PERSON).toBe(1)
    expect(giftAllowed(0)).toBe(true)
    expect(giftAllowed(1)).toBe(false)
    expect(giftAllowed(2)).toBe(false)
    expect(SPEC.SECOND_GIFT).toBe('crm-story-reel')
  })

  it('the caption names the person, the maker and the source, asks once, sells nothing', () => {
    for (const from of ['avatar', 'sent', undefined] as const) {
      const c = giftCaption('Лена', from) // cyrillic-ok: a first name
      expect(c.includes('\n'), 'one line').toBe(false)
      expect(c.startsWith('Лена, ')).toBe(true) // cyrillic-ok: a first name
      expect(c).toMatch('ИИ-ассистент') // cyrillic-ok: the maker, named
      expect(c.split('?').length - 1).toBe(SPEC.CAPTION_QUESTIONS)
      expect(c).not.toMatch(/https?:|t\.me\//)
      expect(c).not.toMatch(/\d+\s*(₽|руб|токен|\$|⭐)/) // cyrillic-ok: price words
    }
    // The source is named only when known; unknown is "your photo", true of both.
    expect(giftCaption('Лена', 'avatar')).toMatch('аватарке') // cyrillic-ok: the answer under test
    expect(giftCaption('Лена', 'sent')).toMatch('вашему фото') // cyrillic-ok: the answer under test
    expect(giftCaption('Лена')).toMatch('вашему фото') // cyrillic-ok: the answer under test
    expect(giftCaption('Лена')).not.toMatch('аватарке') // cyrillic-ok: the answer under test
    // A picture with nobody in it is not "you".
    expect(giftCaption('Лена', 'none')).not.toMatch('это вы') // cyrillic-ok: the answer under test
    expect(SPEC.CAPTION_NAMES_SOURCE).toBe(true)
    expect(SPEC.CUSTOM_CAPTION_CHECKED).toBe('one-line,no-link')
  })

  it('the safe zone leaves the centre for the face', () => {
    // safe_zone_leaves_room(top, bottom, side), and the numbers reach the prompt.
    const { SAFE_ZONE_TOP_PCT: t, SAFE_ZONE_BOTTOM_PCT: b } = SPEC
    expect(t + b).toBeLessThan(100)
    expect(SPEC.SAFE_ZONE_SIDE_PCT * 2).toBeLessThan(100)
    for (const pct of [t, b, SPEC.SAFE_ZONE_SIDE_PCT])
      expect(PORTRAIT_FRAMING_SUFFIX).toContain(`${pct}%`)
    expect(LEAD_MAGNET.framingSuffix).toBe(PORTRAIT_FRAMING_SUFFIX)
    // Identity first, framing last (PROMPT_ORDER).
    expect(SPEC.PROMPT_ORDER).toBe('identity,scene,framing')
    expect(LEAD_MAGNET.identityPrefix).toBe(PORTRAIT_IDENTITY_PREFIX)
    const [w, h] = SPEC.STORY_PX.split('x').map(Number)
    expect(sizeFor(SPEC.ASPECT_RATIO)).toEqual({ width: w, height: h })
  })

  it('a row of three is split; a row of two stands', () => {
    // rows_for(n) = ceil(n / MAX_BUTTONS_PER_ROW), and the bot's `fit` holds
    // the same width. The bot is another package: its constant is read.
    const rowsFor = (n: number) => Math.ceil(n / SPEC.MAX_BUTTONS_PER_ROW)
    expect([rowsFor(3), rowsFor(2), rowsFor(1), rowsFor(4)]).toEqual([
      2, 1, 1, 2,
    ])
    const menu = readFileSync(
      join(
        HERE,
        '..',
        '..',
        '..',
        '..',
        '..',
        'src',
        'navigation',
        'helpers',
        'crmMenu.ts'
      ),
      'utf8'
    )
    expect(menu).toContain(
      `export const MAX_BUTTONS_PER_ROW = ${SPEC.MAX_BUTTONS_PER_ROW}\n`
    )
    const deliver = /deliver: '([^']+)'/.exec(menu)?.[1] ?? ''
    expect(SPEC.PREP_LABEL_NAMES_ASPECT).toBe(true)
    expect(deliver).toContain(SPEC.ASPECT_RATIO)
  })

  it('the price is the Kie 1K price with the platform markup, and it was run live', () => {
    // tokens_for(cost_micro_usd)
    expect(tokensForCostUsd(SPEC.COST_MICRO_USD / 1e6)).toBe(12)
    expect(tokensForCostUsd(0.02)).toBe(8)
    expect(tokensForCostUsd(0.003)).toBe(2)
    expect(TOKEN_PRICES[SPEC.OP]).toBe(SPEC.OP_TOKENS)
    // The cost is the generated Kie price list's, and the spec agrees with it.
    expect(OPERATION_COST_USD[SPEC.OP]).toBe(Number(SPEC.COST_USD))
    expect(СЕБЕСТОИМОСТЬ_USD[SPEC.MODEL]).toBe(Number(SPEC.COST_USD)) // cyrillic-ok: generated table name
    expect(SPEC.COST_MICRO_USD).toBe(Math.round(Number(SPEC.COST_USD) * 1e6))
    expect(SPEC.LIVE_RUN_STATUS).toBe('run-2026-09-16')
  })

  it('the Kie contract is the spec: the model, its tier and its input field', () => {
    expect(LEAD_MAGNET_MODEL).toBe(SPEC.MODEL)
    expect([...GPT_IMAGE_25_EDIT_MODELS]).toEqual([SPEC.MODEL, SPEC.MODEL_ALT])
    expect(LEAD_MAGNET_RESOLUTION).toBe(SPEC.RESOLUTION)
    const input = editInputFor(SPEC.MODEL, {
      prompt: 'p',
      imageUrl: 'https://x/a.jpg',
    })
    expect(input[SPEC.KIE_INPUT_URLS_FIELD]).toEqual(['https://x/a.jpg'])
    expect(input.resolution).toBe(SPEC.RESOLUTION)
    expect(input.aspect_ratio).toBe(SPEC.ASPECT_RATIO)
  })
})
