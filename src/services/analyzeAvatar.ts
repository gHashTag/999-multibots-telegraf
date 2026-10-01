import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'

/*
 * READING A VISION MODEL'S ANSWER WITHOUT MATCHING THE MIDDLE OF A WORD.
 *
 * The prompt below asks Moondream for `FACE:yes/no GENDER:male/female/unclear`,
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

const ANALYZE_PROMPT =
  'Analyze this image. Answer these questions:\n1. Is there a human face clearly visible in this image? (yes/no)\n2. If yes, what is the apparent gender of the person? (male/female/unclear)\nAnswer in format: FACE:yes/no GENDER:male/female/unclear'

const MOONDREAM =
  'lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31'

/*
 * OUR OWN EYES FIRST, A PAID PROVIDER ONLY AFTER THEM.
 *
 * Log 2026-10-01: every new user paged the owner with "[AnalyzeAvatar]
 * Analysis failed ... 402 Payment Required: Insufficient credit" -- the
 * Replicate account ran dry, and Replicate was the only way this question was
 * ever asked. The project already runs its own vision model on Railway's
 * private network (the `vision` service: llama.cpp + Qwen3-VL, the one render
 * reads photos with, render/src/agent/media-vision.ts). So the question goes
 * there first, and Moondream on Replicate is only the fallback.
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

async function withTimeout<T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await work(ac.signal)
  } finally {
    clearTimeout(timer)
  }
}

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
  return withTimeout(OWN_VISION_TIMEOUT_MS, async signal => {
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
  })
}

/**
 * Ask the photo a question: our own model first; Replicate when ours is not
 * configured or failed. When both fail, the error says both reasons.
 */
async function askVision(imageUrl: string, prompt: string): Promise<unknown> {
  let ownFailure: string | null = null
  try {
    const own = await askOwnVision(imageUrl, prompt)
    if (own !== null) return own
  } catch (error) {
    ownFailure = error instanceof Error ? error.message : String(error)
    logger.warn('[AnalyzeAvatar] Own vision failed, trying Replicate', {
      error: ownFailure,
    })
  }
  try {
    return await replicate.run(MOONDREAM as any, {
      input: { image: imageUrl, prompt },
    })
  } catch (error) {
    const replicateFailure =
      error instanceof Error ? error.message : String(error)
    throw new Error(
      ownFailure
        ? `own vision: ${ownFailure}; replicate: ${replicateFailure}`
        : replicateFailure
    )
  }
}

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
 * Detect whether the avatar shows a human face, and the apparent gender.
 * Asked of our own vision model first, then Moondream2 on Replicate.
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

    const output = await askVision(imageUrl, ANALYZE_PROMPT)

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
