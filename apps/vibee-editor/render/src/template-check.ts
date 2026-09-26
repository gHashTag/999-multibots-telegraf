import { z } from 'zod'
import { SplitTalkingHeadSchema } from './compositions/SplitTalkingHead'
import { NoirReelSchema } from './compositions/NoirReel'
import { StoryReelSchema } from './compositions/StoryReel'

/**
 * Compositions whose request is checked against a schema before rendering.
 *
 * A LIST, NOT "CHECK EVERYTHING": some compositions have no schema at all, and
 * the absence of a check has to be VISIBLE here rather than discovered from a
 * reel that came out wrong. A schema appeared -- a row appeared.
 *
 * NoirReel is the row that was missing. Measured in production 2026-09-21,
 * render aee823b0-8780-4dec-8ba5-941be5a2645c: a reel asked for from a still
 * picture started, was accepted with a 202 and a renderId, and died inside
 * Remotion with
 *
 *     No `src` was passed to <OffthreadVideo>.
 *
 * NoirReel plays `lipSyncVideo` full-frame -- it is the reel, not a decoration
 * -- and its defaultProps carry `lipSyncVideo: ''`, so a request that simply
 * omits it renders the empty string and crashes minutes later. The schema that
 * describes this was written and never applied.
 *
 * TrinityBlogReel and LeelaPlanReel are deliberately NOT here: their schemas
 * require fields that live callers today leave to Remotion's defaultProps
 * merge, and this check runs on the raw request. Adding them means checking
 * those callers first, not guessing.
 */
export const CHECKED_COMPOSITIONS: Record<string, z.ZodType> = {
  SplitTalkingHead: SplitTalkingHeadSchema,
  NoirReel: NoirReelSchema,
  // A story with no scenes, or a scene with no clip, is refused at the door
  // for the same reason NoirReel is: it would crash inside Remotion minutes in.
  StoryReel: StoryReelSchema,
}

/**
 * ONE CHECKER FOR BOTH DOORS.
 *
 * There are two ways into a render -- POST /render and POST /render/template
 * -- and the check used to sit inline in the first one only. The second is the
 * one the agent uses (`reel_render`), so every render an agent started went in
 * unchecked. A rule that lives in one of two doorways is not a rule.
 *
 * Returns the reason to refuse, naming the FIELD, or null when the request is
 * the right shape. "Wrong shape" alone makes the caller guess; the agent then
 * guesses again, and pays again.
 */
export function templateSchemaProblem(
  compositionId: string,
  props: unknown
): string | null {
  const schema = CHECKED_COMPOSITIONS[compositionId]
  if (!schema) return null
  const r = schema.safeParse(props ?? {})
  if (r.success) return null
  const where = r.error.issues
    .slice(0, 4)
    .map(i => `${i.path.join('.') || '(корень)'}: ${i.message}`)
    .join('; ')
  return `заявка не проходит схему ${compositionId}: ${where}`
}
