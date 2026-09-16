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
 * Analyze avatar image using Replicate vision model
 * Detects if there's a human face and determines gender
 *
 * Uses Moondream2 - fast and efficient vision model
 * Model: vikhyatk/moondream2
 * Cost: ~$0.0001 per image (very cheap)
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

    // Use Moondream2 - fast vision model for image analysis
    // Model: lucataco/moondream2 (updated from vikhyatk/moondream2)
    // Prompt designed to get structured response about face and gender
    const output = await replicate.run(
      'lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31' as any,
      {
        input: {
          image: imageUrl,
          prompt:
            'Analyze this image. Answer these questions:\n1. Is there a human face clearly visible in this image? (yes/no)\n2. If yes, what is the apparent gender of the person? (male/female/unclear)\nAnswer in format: FACE:yes/no GENDER:male/female/unclear',
        },
      }
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
    const output = await replicate.run(
      'lucataco/moondream2:72ccb656353c348c1385df54b237eeb7bfa874bf11486cf0b9473e691b662d31' as any,
      {
        input: {
          image: imageUrl,
          prompt: 'Is there a human face in this image? Answer only yes or no.',
        },
      }
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
