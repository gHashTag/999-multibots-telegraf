/**
 * The KieAI models this project can actually reach, established by measurement.
 *
 * HOW THIS LIST WAS BUILT, AND WHY IT COST NOTHING.
 *
 * KieAI validates the request before it starts a job, so an intentionally
 * incomplete payload gets a semantic answer and never reaches billing. Sending
 * `{"model": X, "input": {}}` therefore distinguishes three states for free:
 *
 *   "The model name you specified is not supported"  -> the name does not exist
 *   "<field> is required"                            -> the name EXISTS and the
 *                                                       message names its contract
 *   "This interface is temporarily paused"           -> exists, off at provider
 *
 * That is the whole method. No credits were spent discovering any of this, and
 * the same probe re-runs in CI as a test without spending any either.
 *
 * WHAT THE MEASUREMENT OVERTURNED. `veo3` and `veo3_fast` are referenced in
 * this repository (wan25-config, the provider registry) and KieAI does not know
 * either name. They were dead the whole time and nothing said so, because a
 * failing generation looks like a failing generation, not like a typo.
 */

/** What a probe with empty input proves about a model. */
export type KieState =
  /** Name exists and the API named the fields it wants. */
  | 'live'
  /** Name exists, provider has it switched off right now. Not our fault, not our fix. */
  | 'paused'
  /** KieAI does not know this name. Ours to remove. */
  | 'unknown'

export interface KieModel {
  id: string
  /** What a person would call it. */
  title: string
  kind: 'video' | 'image' | 'lipsync'
  state: KieState
  /** Fields the API itself demanded, verbatim from its reply. */
  needs: string[]
  /** The exact sentence KieAI returned, so a future reader can re-check. */
  probed: string
}

/**
 * Measured 2026-08-31 against api.kie.ai/api/v1/jobs/createTask.
 *
 * `probed` holds the API's own words rather than a summary. When one of these
 * changes, the test that re-probes will print the old sentence beside the new
 * one, and whoever reads it can tell a provider change from a broken key —
 * which a boolean could never do.
 */
export const KIE_MODELS: KieModel[] = [
  {
    id: 'veed/fabric-1',
    title: 'Липсинк по фото',
    kind: 'lipsync',
    state: 'live',
    needs: ['image_url'],
    probed: 'image_url is required',
  },
  {
    id: 'google/nano-banana',
    title: 'Картинка по описанию',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'google/nano-banana-edit',
    title: 'Правка картинки',
    kind: 'image',
    state: 'live',
    needs: ['image_urls'],
    probed: 'image_urls is required',
  },
  {
    id: 'google/imagen4',
    title: 'Imagen 4',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'This field is required',
  },
  {
    id: 'qwen/image-edit',
    title: 'Правка картинки (Qwen)',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'sora-2-text-to-video',
    title: 'Sora 2 — видео по тексту',
    kind: 'video',
    state: 'paused',
    needs: [],
    probed: 'This interface is temporarily paused.',
  },
  {
    id: 'sora-2-pro-text-to-video',
    title: 'Sora 2 Pro — видео по тексту',
    kind: 'video',
    state: 'paused',
    needs: [],
    probed: 'This interface is temporarily paused.',
  },
  {
    id: 'sora-2-image-to-video',
    title: 'Sora 2 — видео из картинки',
    kind: 'video',
    state: 'paused',
    needs: [],
    probed: 'This interface is temporarily paused.',
  },
]

/**
 * Names this repository still references that KieAI does not know.
 *
 * Kept rather than deleted quietly: a test asserts they stay absent from the
 * live list, so nobody re-adds them from an old config and spends a week
 * debugging generations that were never going to run.
 */
export const KIE_DEAD_NAMES = ['veo3', 'veo3_fast'] as const

export const KIE_ENDPOINT = 'https://api.kie.ai/api/v1/jobs/createTask'

/** Models a caller can actually use right now. */
export function живые(): KieModel[] {
  return KIE_MODELS.filter(m => m.state === 'live')
}

/**
 * Reads a KieAI reply and says which of the three states it means.
 *
 * Deliberately matches on the API's SENTENCE, not on the HTTP code: paused and
 * missing-field both come back as 500, and unsupported-name as 422. The status
 * alone cannot tell "off at the provider" from "you forgot a field", and those
 * call for opposite responses — wait versus fix.
 */
export function состояниеИзОтвета(msg: string): KieState {
  if (/not supported/i.test(msg)) return 'unknown'
  if (/temporarily paused/i.test(msg)) return 'paused'
  return 'live'
}
