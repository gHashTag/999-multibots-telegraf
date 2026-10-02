/**
 * THE STUDIO STEP, READ FROM ITS SPEC.
 *
 * gHashTag/t27 specs/automation/owner-studio.t27 holds the identity lock and
 * the ready-made studios; this file only puts them in order for one Kie
 * gpt-image-2-5 edit. The identity goes first so the scene cannot outvote
 * the face. Recipe: .claude/skills/owner-studio/SKILL.md.
 */
import * as SPEC from './spec/owner-studio.gen'

export const STUDIOS = [
  { id: SPEC.STUDIO_1_ID, scene: SPEC.STUDIO_1 },
  { id: SPEC.STUDIO_2_ID, scene: SPEC.STUDIO_2 },
  { id: SPEC.STUDIO_3_ID, scene: SPEC.STUDIO_3 },
] as const

/** The prompt for one studio, identity first; '' for a studio we do not have. */
export function studioPrompt(id: string): string {
  const s = STUDIOS.find(x => x.id === id)
  return s ? `${SPEC.IDENTITY} ${s.scene}` : ''
}

/** The Kie createTask body for one studio frame of this source photo. */
export function studioTask(id: string, sourceUrl: string) {
  const prompt = studioPrompt(id)
  if (!prompt || !sourceUrl) return null
  return {
    model: SPEC.MODEL,
    input: {
      prompt,
      input_urls: [sourceUrl],
      aspect_ratio: SPEC.ASPECT_RATIO,
      resolution: SPEC.RESOLUTION,
    },
  }
}
