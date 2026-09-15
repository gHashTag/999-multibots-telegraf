import { describe, it, expect } from 'vitest'

/*
 * TWO REQUESTS, ONE SCENE, ONE ROOT CAUSE EACH.
 *
 * "формат фото по дефолту 9:16" -- and 9:16 was never unavailable at the
 * provider. Replicate's own schema for black-forest-labs/flux-kontext-max
 * lists fourteen ratios, 9:16 among them (read from
 * GET https://api.replicate.com/v1/models/... on 2026-09-15). This repository's
 * zod enum listed three, and the gap was papered over downstream by rewriting a
 * request for portrait into `match_input_image` -- which preserves the INPUT's
 * shape, and a Telegram avatar is SQUARE. So everyone who had chosen 9:16 was
 * handed 1:1 by the model that heads the default chain.
 *
 * The second request: make the photo from the avatar only if that photo
 * exists, and if there is none, do not even offer it. The keyboard offered the
 * "use my avatar" button to accounts that have no avatar at all.
 * `getUserPhotoUrl` returns `string | null` and
 * tsconfig.json keeps "strict": false, so the null travelled silently to the
 * sender, Telegram refused it, and the refusal became a 🚨 alert in the owner's
 * chat. The person, meanwhile, learned the option was impossible only after
 * choosing it.
 */
import {
  FluxKontextMaxAspectRatioSchema,
  FluxKontextMaxInputSchema,
  FLUX_KONTEXT_MAX_AVATAR_CONFIG,
  getFluxKontextMaxDimensions,
} from '@/schemas/fluxKontextMax.schema'
import {
  NanoBananaAspectRatioSchema,
  NanoBananaInputSchema,
} from '@/schemas/nanoBanana.schema'
import {
  avatarActionKeyboard,
  avatarActionCaption,
  AVATAR_BUTTON_RU,
  AVATAR_BUTTON_EN,
  UPLOAD_BUTTON_RU,
} from '@/scenes/avatarTransformScene/actionPrompt'

const flatten = (markup: { keyboard?: unknown }) =>
  JSON.stringify(markup?.keyboard ?? markup)

describe('the enum matches what the model accepts', () => {
  it('9:16 is a valid ratio -- it always was, at the provider', () => {
    expect(FluxKontextMaxAspectRatioSchema.safeParse('9:16').success).toBe(true)
  })

  it('all fourteen ratios Replicate lists are accepted', () => {
    // Measured, not guessed. If Replicate narrows this list, the schema should
    // be re-read from the API rather than trimmed to whatever still passes.
    const measured = [
      'match_input_image',
      '1:1',
      '16:9',
      '9:16',
      '4:3',
      '3:4',
      '3:2',
      '2:3',
      '4:5',
      '5:4',
      '21:9',
      '9:21',
      '2:1',
      '1:2',
    ]
    for (const ratio of measured) {
      expect(
        FluxKontextMaxAspectRatioSchema.safeParse(ratio).success,
        `${ratio} must be accepted`
      ).toBe(true)
    }
  })

  it('a ratio the model does not know is still rejected', () => {
    expect(FluxKontextMaxAspectRatioSchema.safeParse('7:3').success).toBe(false)
  })
})

describe('portrait is the default, everywhere the default is written', () => {
  it('the FLUX input schema defaults to 9:16', () => {
    const parsed = FluxKontextMaxInputSchema.parse({
      prompt: 'a portrait',
      input_image: 'https://example.invalid/a.jpg',
    })
    expect(parsed.aspect_ratio).toBe('9:16')
  })

  it('the avatar preset is 9:16, not match_input_image', () => {
    // `match_input_image` on a SQUARE avatar returns a square. That is the
    // whole defect, in one field.
    expect(FLUX_KONTEXT_MAX_AVATAR_CONFIG.aspect_ratio).toBe('9:16')
  })

  it('nano-banana sends the field at all -- it never used to', () => {
    // Without aspect_ratio in the body Replicate applied its OWN default,
    // match_input_image, so this model produced squares regardless of setting.
    const parsed = NanoBananaInputSchema.parse({
      prompt: 'a portrait',
      image_input: ['https://example.invalid/a.jpg'],
    })
    expect(parsed.aspect_ratio).toBe('9:16')
  })

  it('nano-banana knows 9:16 too', () => {
    expect(NanoBananaAspectRatioSchema.safeParse('9:16').success).toBe(true)
  })
})

describe('the reported dimensions follow the ratio that was asked for', () => {
  it('9:16 reports a PORTRAIT, taller than it is wide', () => {
    const d = getFluxKontextMaxDimensions('9:16')
    expect(d).not.toBeNull()
    expect(d!.height).toBeGreaterThan(d!.width)
  })

  it('the two shapes that already worked do not move', () => {
    expect(getFluxKontextMaxDimensions('1:1')).toEqual({
      width: 1024,
      height: 1024,
    })
    expect(getFluxKontextMaxDimensions('16:9')).toEqual({
      width: 1920,
      height: 1080,
    })
  })

  it('match_input_image reports nothing, because it copies the input', () => {
    expect(getFluxKontextMaxDimensions('match_input_image')).toBeNull()
  })

  it('every ratio gets its OWN shape -- the old switch answered 1024x1024 to eleven of them', () => {
    const ratios = ['4:3', '3:4', '21:9', '9:21', '4:5', '5:4'] as const
    for (const r of ratios) {
      const [w, h] = r.split(':').map(Number)
      const d = getFluxKontextMaxDimensions(r)!
      const asked = w / h
      const got = d.width / d.height
      // Rounding to a multiple of 16 moves the ratio slightly; 5% is generous
      // for that and nowhere near generous enough to let a square through.
      expect(
        Math.abs(got - asked) / asked,
        `${r} -> ${d.width}x${d.height}`
      ).toBeLessThan(0.05)
    }
  })
})

describe('the avatar button needs an avatar', () => {
  it('with a photo, both options are offered', () => {
    const kb = flatten(avatarActionKeyboard(true, true))
    expect(kb).toContain(AVATAR_BUTTON_RU)
    expect(kb).toContain(UPLOAD_BUTTON_RU)
  })

  it('WITHOUT a photo the avatar button is not drawn at all', () => {
    // The request was not to offer it at all: not greyed out, not answered
    // with an error after the tap. Absent.
    const kb = flatten(avatarActionKeyboard(true, false))
    expect(kb).not.toContain(AVATAR_BUTTON_RU)
    expect(kb).toContain(UPLOAD_BUTTON_RU)
  })

  it('the English keyboard behaves the same way', () => {
    expect(flatten(avatarActionKeyboard(false, true))).toContain(
      AVATAR_BUTTON_EN
    )
    expect(flatten(avatarActionKeyboard(false, false))).not.toContain(
      AVATAR_BUTTON_EN
    )
  })

  it('the way back is always there, in both states', () => {
    for (const hasPhoto of [true, false]) {
      expect(flatten(avatarActionKeyboard(true, hasPhoto))).toContain(
        'Назад к выбору модели'
      )
    }
  })

  it('the caption SAYS why the option is missing', () => {
    // A silently shorter keyboard reads as a bug. Tell the person.
    const text = avatarActionCaption({
      isRu: true,
      genderDisplay: 'Мужской образ',
      modelDisplayName: 'FLUX Kontext Max (Google)',
      hasPhoto: false,
    })
    expect(text).toContain('Фото профиля не найдено')
    expect(text).not.toContain('Ваше фото для трансформации')
  })

  it('with a photo the caption describes the photo above it', () => {
    const text = avatarActionCaption({
      isRu: true,
      genderDisplay: 'Женский образ',
      modelDisplayName: 'SeeDream-4.5 (ByteDance)',
      hasPhoto: true,
    })
    expect(text).toContain('Ваше фото для трансформации')
    expect(text).toContain('SeeDream-4.5 (ByteDance)')
  })

  it('both captions still carry the selections they are there to confirm', () => {
    for (const hasPhoto of [true, false]) {
      const text = avatarActionCaption({
        isRu: false,
        genderDisplay: 'Male style',
        modelDisplayName: 'FLUX Kontext Max (Google)',
        hasPhoto,
      })
      expect(text).toContain('Male style')
      expect(text).toContain('FLUX Kontext Max (Google)')
    }
  })
})
