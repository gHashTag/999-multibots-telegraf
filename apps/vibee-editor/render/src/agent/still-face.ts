/**
 * Does a story still show the person? (crm-story-reel v19, STILL_FACE_CHECKED)
 *
 * On 2026-10-03 the owner's reel opened on an empty street: the still's
 * prompt named the setting first, and nothing looked at the picture before a
 * voice and a lip-sync were paid for it. Our own vision answers one question
 * here. face-api is not used: its tfjs-node binding is not in the render
 * image, so in production it could only ever say "unknown".
 *
 * true -- a face; false -- none; null -- not checked (vision off, down, or an
 * answer that is neither word). Null never refuses a still (FACE_UNKNOWN_KEEPS).
 */
import { askVision, shrinkJpeg, visionConfig } from './media-vision'

export const FACE_QUESTION =
  'Is a human face clearly visible in this picture? Answer with one word: YES or NO.'

/** Side of the picture vision is shown: enough to see a face, cheap to send. */
const FACE_SIDE = 448
const FACE_TIMEOUT_MS = 60_000

/** The answer read as yes, no, or neither. */
export function readYesNo(text: string | null | undefined): boolean | null {
  const t = String(text ?? '')
    .trim()
    .toUpperCase()
  if (/^YES\b/.test(t)) return true
  if (/^NO\b/.test(t)) return false
  return null
}

/** Shows vision one picture and returns its words; throws when it cannot. */
export type FaceAsk = (url: string) => Promise<string | null>

const liveAsk = (): FaceAsk | null => {
  const v = visionConfig()
  if (!v) return null
  return async url => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const small = await shrinkJpeg(
      Buffer.from(await r.arrayBuffer()),
      FACE_SIDE
    )
    return askVision(
      v,
      FACE_QUESTION,
      [`data:image/jpeg;base64,${small.toString('base64')}`],
      FACE_TIMEOUT_MS,
      3,
      'live'
    )
  }
}

export async function stillShowsAFace(
  url: string,
  ask: FaceAsk | null = liveAsk()
): Promise<boolean | null> {
  if (!ask) return null
  try {
    return readYesNo(await ask(url))
  } catch {
    return null
  }
}
