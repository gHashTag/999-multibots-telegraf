import { logger } from '@/utils/logger'

/*
 * WHO LOOKS AT THE AVATAR: OUR OWN MODEL FIRST, THEN KIE, NOT REPLICATE.
 *
 * This used to be Moondream on Replicate. On 2026-10-01 the Replicate account
 * ran dry, every new user paged the owner with `402 Insufficient credit`, and
 * nobody got a welcome portrait. Media generation already runs on Kie, and
 * Kie's OpenAI-compatible chat endpoint takes an `image_url` part.
 *
 * `gpt-5-2` was checked live on 2026-10-01 with this exact prompt: a woman's
 * portrait came back `FACE:yes GENDER:female` and a man's `FACE:yes
 * GENDER:male`, at 0.02 credits each. `gemini-3-pro` gave the same verdict
 * but cost 0.12, took about 45 s, and once came back empty. `gemini-2.5-flash`
 * is refused on this key ("The channel is not supported").
 */
const KIE_CHAT_URL = 'https://api.kie.ai/v1/chat/completions'
const KIE_VISION_MODEL = 'gpt-5-2'
/** Signup waits on this answer, so it must not hang there. */
const VISION_TIMEOUT_MS = 60_000

/** Ask Kie's vision model one question about one picture; the text reply. */
async function askKieVision(imageUrl: string, prompt: string): Promise<string> {
  const key = process.env.KIE_AI_API_KEY
  if (!key) throw new Error('KIE_AI_API_KEY is not set')
  const r = await fetch(KIE_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: KIE_VISION_MODEL,
      stream: false,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
  })
  const body: any = await r.json().catch(() => null)
  // Kie reports some failures as HTTP 200 with `{ code, msg }` in the body.
  const content = body?.choices?.[0]?.message?.content
  if (!r.ok || typeof content !== 'string') {
    throw new Error(
      `Kie vision answered ${r.status}: ${String(body?.msg ?? 'no content').slice(0, 160)}`
    )
  }
  return content
}

/*
 * OUR OWN EYES FIRST, A PAID PROVIDER ONLY AFTER THEM.
 *
 * The project already runs its own vision model on Railway's private network
 * (the `vision` service: llama.cpp + Qwen3-VL, the one render reads photos
 * with, render/src/agent/media-vision.ts). The question goes there first, and
 * Kie (above) is only the fallback -- one paid provider as the only eye is a
 * single point of failure, which is how the 2026-10-01 Replicate 402 took the
 * whole welcome gift down.
 *
 * Configured as in render: VISION_API_KEY (without it this step is skipped),
 * VISION_BASE_URL (default the private host), VISION_MODEL. The photo is
 * fetched here and inlined as a data: URL, because the self-hosted server is
 * not asked to reach the outside.
 */
const OWN_VISION_BASE = 'http://vision.railway.internal:8000/v1'
const OWN_VISION_MODEL = 'qwen3-vl-2b-instruct'
/** CPU inference: a photo takes seconds, a cold one up to a minute. */
const OWN_VISION_TIMEOUT_MS = 60_000
const MAX_PHOTO_BYTES = 10 * 1024 * 1024

/** The answer of our own vision model, or null when it is not configured. */
export async function askOwnVision(
  imageUrl: string,
  prompt: string
): Promise<string | null> {
  const key = process.env.VISION_API_KEY
  if (!key) return null
  const base = (process.env.VISION_BASE_URL || OWN_VISION_BASE).replace(
    /\/+$/,
    ''
  )
  const signal = AbortSignal.timeout(OWN_VISION_TIMEOUT_MS)
  const photo = await fetch(imageUrl, { signal })
  if (!photo.ok) throw new Error(`photo answered ${photo.status}`)
  const bytes = Buffer.from(await photo.arrayBuffer())
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES)
    throw new Error(`photo of ${bytes.length} bytes is outside the range`)
  const mime = photo.headers.get('content-type') || 'image/jpeg'
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.VISION_MODEL || OWN_VISION_MODEL,
      max_tokens: 60,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mime};base64,${bytes.toString('base64')}`,
              },
            },
          ],
        },
      ],
    }),
  })
  if (!r.ok) throw new Error(`own vision answered ${r.status}`)
  const data = (await r.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const text = data.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim())
    throw new Error('own vision answered nothing')
  return text
}

/**
 * Ask the photo a question: our own model first; Kie when ours is not
 * configured or failed. When both fail, the error says both reasons.
 */
async function askVision(imageUrl: string, prompt: string): Promise<string> {
  let ownFailure: string | null = null
  try {
    const own = await askOwnVision(imageUrl, prompt)
    if (own !== null) return own
  } catch (error) {
    ownFailure = error instanceof Error ? error.message : String(error)
    logger.warn('[AnalyzeAvatar] Own vision failed, trying Kie', {
      error: ownFailure,
    })
  }
  try {
    return await askKieVision(imageUrl, prompt)
  } catch (error) {
    const kieFailure = error instanceof Error ? error.message : String(error)
    throw new Error(
      ownFailure ? `own vision: ${ownFailure}; kie: ${kieFailure}` : kieFailure
    )
  }
}

/*
 * READING A VISION MODEL'S ANSWER WITHOUT MATCHING THE MIDDLE OF A WORD.
 *
 * The prompt below asks the vision model for `FACE:yes/no GENDER:male/female/unclear`,
 * and the reply was read with bare `String.includes`. Two of those substrings
 * live inside ordinary English words, so the reader answered questions the
 * model had not been asked:
 *
 *   'yes'    is inside 'eyes'    -- "FACE:no ... the cat's eyes are visible"
 *   'person' is inside 'no person'
 *
 * Either one alone flipped hasFace to true, which hands a stranger's cat to
 * the welcome-portrait lead magnet (scenes/createUserScene.ts:181) and writes
 * a gender guessed from a photograph with no face in it.
 *
 * So: the structured verdict first, because that is what we asked for; a
 * word-boundary reading of the prose only when the model ignored the format;
 * and an explicit denial ("no face", "no person") beats both, because a
 * sentence that mentions a face to say it is absent is not an affirmation.
 */

/** The answer we asked for: `FACE:yes`, `face: no`. */
const FACE_VERDICT = /face\s*:\s*(yes|no)\b/
/** The answer we asked for: `GENDER:female`, `gender: unclear`. */
const GENDER_VERDICT = /gender\s*:\s*(female|male|unclear|unknown)\b/
/** The model saying there is nobody in the picture, in prose. */
const DENIES_FACE =
  /\bno\s+(?:human\s+|visible\s+)?(?:faces?|persons?|people|humans?)\b|\bnot\s+a\s+(?:face|person|human)\b|\bnobody\b/
/** The model saying there is somebody in the picture, in prose. */
const AFFIRMS_FACE =
  /\b(?:yes|faces?|persons?|people|human|man|woman|portrait|selfie)\b/

/**
 * Result of avatar analysis
 */
export interface AvatarAnalysisResult {
  hasFace: boolean
  gender: 'male' | 'female' | 'unknown'
  confidence: number
  avatarUrl: string | null
  error?: string
}

/**
 * Analyze avatar image: our own vision model first, then Kie (see above).
 * Detects if there's a human face and determines gender.
 */
export async function analyzeAvatar(
  imageUrl: string
): Promise<AvatarAnalysisResult> {
  const defaultResult: AvatarAnalysisResult = {
    hasFace: false,
    gender: 'unknown',
    confidence: 0,
    avatarUrl: imageUrl,
  }

  if (!imageUrl) {
    logger.warn('[AnalyzeAvatar] No image URL provided')
    return { ...defaultResult, error: 'No image URL' }
  }

  try {
    logger.info('[AnalyzeAvatar] Starting analysis', {
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    // Prompt designed to get structured response about face and gender
    const output = await askVision(
      imageUrl,
      'Analyze this image. Answer these questions:\n1. Is there a human face clearly visible in this image? (yes/no)\n2. If yes, what is the apparent gender of the person? (male/female/unclear)\nAnswer in format: FACE:yes/no GENDER:male/female/unclear'
    )

    logger.info('[AnalyzeAvatar] Raw response', { output })

    // Parse the response
    const response = String(output).toLowerCase()

    // Detect face presence: the asked-for verdict, then a denial, then prose.
    const faceVerdict = FACE_VERDICT.exec(response)?.[1]
    const hasFace = faceVerdict
      ? faceVerdict === 'yes'
      : !DENIES_FACE.test(response) && AFFIRMS_FACE.test(response)

    // Detect gender
    let gender: 'male' | 'female' | 'unknown' = 'unknown'
    let confidence = 0

    if (hasFace) {
      const genderVerdict = GENDER_VERDICT.exec(response)?.[1]
      // `\bmale\b` does not match inside 'female', and `\bman\b` does not
      // match inside 'woman' -- which is the whole point of the boundaries.
      const saysMale = /\bmale\b/.test(response)
      const saysFemale = /\bfemale\b/.test(response)
      const saysWoman = /\bwoman\b/.test(response)

      if (genderVerdict === 'male' || genderVerdict === 'female') {
        // The asked-for answer wins outright; prose is only a fallback.
        gender = genderVerdict
        confidence = 80
      } else if (saysMale && !saysFemale) {
        gender = 'male'
        confidence = 80
      } else if (saysFemale || saysWoman) {
        gender = 'female'
        confidence = 80
      } else if (/\bman\b/.test(response) && !saysWoman) {
        gender = 'male'
        confidence = 70
      } else {
        // Couldn't determine gender
        gender = 'unknown'
        confidence = 50
      }
    }

    const result: AvatarAnalysisResult = {
      hasFace,
      gender,
      confidence,
      avatarUrl: imageUrl,
    }

    logger.info('[AnalyzeAvatar] Analysis complete', result)
    return result
  } catch (error) {
    logger.error('[AnalyzeAvatar] Analysis failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      imageUrl: imageUrl.substring(0, 50) + '...',
    })

    return {
      ...defaultResult,
      error: error instanceof Error ? error.message : 'Analysis failed',
    }
  }
}

/**
 * Quick check if image has a face (without gender detection)
 * Uses simpler prompt for faster response
 */
export async function quickFaceCheck(imageUrl: string): Promise<boolean> {
  try {
    const output = await askVision(
      imageUrl,
      'Is there a human face in this image? Answer only yes or no.'
    )

    const response = String(output).toLowerCase()
    // Not `includes('yes')`: 'yes' is inside 'eyes', and a one-word prompt
    // about faces invites an answer that mentions eyes.
    return /\byes\b/.test(response) && !DENIES_FACE.test(response)
  } catch (error) {
    logger.error('[QuickFaceCheck] Failed', { error })
    return false
  }
}
