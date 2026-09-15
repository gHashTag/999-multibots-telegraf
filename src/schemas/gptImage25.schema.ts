import { z } from 'zod'

/**
 * GPT-Image-2.5 (OpenAI, served through kie.ai's Jobs API).
 *
 * Every value below was read from the live API on 2026-09-15 with the
 * production KIE_AI_API_KEY, not from the marketing page:
 *
 *   - the three model ids answered 200; a fourth plausible one,
 *     `gpt-image-2-5-flare-edit-image`, answers 422 "model not found", so
 *     image-to-image is a separate model id and NOT a flag on the text model;
 *   - `aspect_ratio` accepts the thirteen values in the enum; a 9:16 request
 *     came back 940 x 1672 (ratio 0.5622), so the ratio is honoured rather
 *     than cropped from a square;
 *   - one 1K image cost 6 credits and took ~50 s end to end.
 *
 * The enum is the point. FLUX's aspect-ratio enum in this repo held three of
 * the provider's fourteen values, and the four missing portrait ratios were
 * quietly remapped to "match the input image" -- which, for a square Telegram
 * avatar, delivered 1:1 to everyone who asked for 9:16. Writing down only the
 * values you happen to use is how that happens.
 */
export const GptImage25ModelSchema = z.enum([
  'gpt-image-2-5-flare-text-to-image',
  'gpt-image-2-5-flare-image-to-image',
  'gpt-image-2-5-sunburst-text-to-image',
])

export const GptImage25AspectRatioSchema = z.enum([
  'auto',
  '1:1',
  '3:2',
  '2:3',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '21:9',
  '27:16',
  '16:27',
  '9:8',
  '8:9',
])

export const GptImage25ResolutionSchema = z.enum(['1K', '2K', '4K'])

export const GptImage25BackgroundSchema = z.enum([
  'transparent',
  'opaque',
  'auto',
])

export const GptImage25InputSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(5000, 'Prompt too long'),
  /**
   * Source images for image-to-image. The API names this `image_urls` and
   * takes an array even when there is one.
   */
  image_urls: z.array(z.string().url()).min(1).max(4).optional(),
  // Portrait by default, for the same reason as FLUX: this bot's images are
  // sent to Telegram and looked at on a phone.
  aspect_ratio: GptImage25AspectRatioSchema.default('9:16'),
  resolution: GptImage25ResolutionSchema.default('1K'),
  background: GptImage25BackgroundSchema.default('auto'),
})

export type GptImage25Model = z.infer<typeof GptImage25ModelSchema>
export type GptImage25AspectRatio = z.infer<typeof GptImage25AspectRatioSchema>
export type GptImage25Resolution = z.infer<typeof GptImage25ResolutionSchema>
export type GptImage25Input = z.infer<typeof GptImage25InputSchema>

/**
 * Which model id to send. With a source image the text-to-image id silently
 * ignores `image_urls` -- it does not error -- so choosing by "do we have an
 * input image" is the only thing standing between a person's avatar and a
 * picture of a stranger who merely matches the prompt.
 */
export function pickGptImage25Model(hasInputImage: boolean): GptImage25Model {
  return hasInputImage
    ? 'gpt-image-2-5-flare-image-to-image'
    : 'gpt-image-2-5-flare-text-to-image'
}

/** Measured: 940 x 1672 for 9:16 at 1K, i.e. ~1.5 MP on the long edge. */
export function getGptImage25Dimensions(aspectRatio: GptImage25AspectRatio): {
  width: number
  height: number
} | null {
  if (aspectRatio === 'auto') return null
  const [w, h] = aspectRatio.split(':').map(Number)
  if (!w || !h) return null
  const scale = Math.sqrt((1024 * 1536) / (w * h))
  const round4 = (n: number) => Math.max(4, Math.round(n / 4) * 4)
  return { width: round4(w * scale), height: round4(h * scale) }
}

export const GPT_IMAGE_25_AVATAR_CONFIG: Partial<GptImage25Input> = {
  aspect_ratio: '9:16',
  resolution: '1K',
  background: 'auto',
}
