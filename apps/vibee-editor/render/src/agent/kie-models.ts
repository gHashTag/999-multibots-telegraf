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
 * That is the method, and it held for 58 of the 59 models tried.
 *
 * THE EXCEPTION, WHICH COST REAL MONEY AND IS THE MOST IMPORTANT LINE HERE.
 * `grok-imagine/image-to-video` does NOT validate. Sent `{"input":{}}` it
 * answered `success` with a taskId — it created a job. The probe billed for it,
 * and then I billed a second time confirming the first. Two tasks, both mine,
 * both avoidable if I had checked one model before running fifty-nine.
 *
 * A method that is free for 98% of cases is not a free method; it is a method
 * with a hole, and the hole only shows on the model that behaves differently.
 * NEVER_PROBE below is that hole, named. Nothing may probe those ids — not the
 * CI test, not a future sweep of a new catalogue.
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
  kind: 'video' | 'image' | 'lipsync' | 'audio' | 'script'
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
  /*
   * THE ONE ENTRY NOT ESTABLISHED BY THE EMPTY-INPUT PROBE.
   *
   * The lead magnet's model was run for real on 2026-09-16, at the owner's
   * word, against his own avatar so that nothing reached a client. It drew a
   * 941x1672 portrait in 75 seconds for six credits -- the exact price the
   * price list names for image-to-image at 1K, confirmed rather than believed.
   *
   * It was deliberately NOT probed with empty input. That method has a hole
   * named at the top of this file: grok-imagine answered an empty request by
   * CREATING a billable job. A model that draws on a full request is exactly
   * the shape that might bill on an empty one, and the guess would be spent
   * from the owner's balance. `needs` here is the contract the vendor's own
   * documentation names and the successful call then exercised, so `probed`
   * records what the run returned instead of a validation sentence.
   *
   * WHICH IS WHY IT IS IN NEVER_PROBE, AND NOT ONLY FOR THE MONEY. The test
   * that checks "the state agrees with its own quote" runs `probed` through
   * the state-from-answer helper, which returns 'live' for ANY text it does
   * not recognise as a refusal. Prose would have sailed through it by
   * default rather than by agreement -- a green that proves nothing. Listing
   * the id makes the test skip this entry deliberately, which is what the
   * comment beside that skip already says it is for.
   */
  {
    id: 'gpt-image-2-5-flare-image-to-image',
    title: 'GPT Image 2.5 Flare (lead magnet)',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'input_urls', 'aspect_ratio', 'resolution'],
    probed:
      'run for real 2026-09-16: 941x1672 in 75s, 6 credits at resolution 1K',
  },
  {
    id: 'seedream/5-lite-text-to-image',
    title: 'seedream/5-lite-text-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'aspect_ratio', 'quality'],
    probed: 'This field is required',
  },
  {
    id: 'seedream/5-pro-text-to-image',
    title: 'seedream/5-pro-text-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'aspect_ratio', 'quality'],
    probed: 'This field is required',
  },
  {
    id: 'seedream/5-pro-image-to-image',
    title: 'seedream/5-pro-image-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'image_urls', 'aspect_ratio', 'quality'],
    probed: 'This field is required',
  },
  {
    id: 'google/imagen4-fast',
    title: 'google/imagen4-fast',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'google/imagen4-ultra',
    title: 'google/imagen4-ultra',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'aspect_ratio'],
    probed: 'This field is required',
  },
  {
    id: 'google/imagen4',
    title: 'google/imagen4',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'aspect_ratio'],
    probed: 'This field is required',
  },
  {
    id: 'google/nano-banana-edit',
    title: 'google/nano-banana-edit',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'google/nano-banana',
    title: 'google/nano-banana',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'grok-imagine/text-to-image',
    title: 'grok-imagine/text-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'aspect_ratio'],
    probed: 'This field is required',
  },
  {
    id: 'grok-imagine/image-to-image',
    title: 'grok-imagine/image-to-image',
    kind: 'image',
    state: 'live',
    needs: ['image_urls'],
    probed: 'This field is required',
  },
  {
    id: 'topaz/image-upscale',
    title: 'topaz/image-upscale',
    kind: 'image',
    state: 'live',
    needs: ['image_url'],
    probed: 'image_url is required',
  },
  {
    id: 'recraft/remove-background',
    title: 'recraft/remove-background',
    kind: 'image',
    state: 'live',
    needs: ['image'],
    probed: 'image is required',
  },
  {
    id: 'recraft/crisp-upscale',
    title: 'recraft/crisp-upscale',
    kind: 'image',
    state: 'live',
    needs: ['image'],
    probed: 'image is required',
  },
  {
    id: 'ideogram/v3-text-to-image',
    title: 'ideogram/v3-text-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'This field is required',
  },
  {
    id: 'ideogram/character',
    title: 'ideogram/character',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'qwen/text-to-image',
    title: 'qwen/text-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'qwen/image-edit',
    title: 'qwen/image-edit',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'qwen3/text-to-image',
    title: 'qwen3/text-to-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'This field is required',
  },
  {
    id: 'wan/2-7-image',
    title: 'wan/2-7-image',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'This field is required',
  },
  {
    id: 'grok-imagine/text-to-video',
    title: 'grok-imagine/text-to-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'grok-imagine/image-to-video',
    title: 'grok-imagine/image-to-video',
    kind: 'video',
    state: 'live',
    needs: [],
    probed: 'НЕ ПРОБОВАТЬ: принимает пустой вход и создаёт задание',
  },
  {
    id: 'kling/ai-avatar-standard',
    title: 'kling/ai-avatar-standard',
    kind: 'lipsync',
    state: 'live',
    needs: ['image_url'],
    probed: 'image_url is required',
  },
  {
    id: 'kling/v2-1-pro',
    title: 'kling/v2-1-pro',
    kind: 'image',
    state: 'live',
    needs: ['prompt', 'image_url'],
    probed: 'This field is required',
  },
  {
    id: 'kling/v3-turbo-text-to-video',
    title: 'kling/v3-turbo-text-to-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt', 'duration', 'aspect_ratio', 'resolution'],
    probed: 'This field is required',
  },
  {
    id: 'bytedance/seedance-2',
    title: 'bytedance/seedance-2',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'Please fill in the text prompt or image, video, or audio',
  },
  {
    id: 'bytedance/seedance-2-fast',
    title: 'bytedance/seedance-2-fast',
    kind: 'image',
    state: 'live',
    needs: ['prompt'],
    probed: 'Please fill in the text prompt or image, video, or audio',
  },
  {
    id: 'bytedance/v1-pro-text-to-video',
    title: 'bytedance/v1-pro-text-to-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt'],
    probed:
      'Server exception, please try again later or contact customer service',
  },
  {
    id: 'hailuo/02-text-to-video-pro',
    title: 'hailuo/02-text-to-video-pro',
    kind: 'video',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'wan/2-5-text-to-video',
    title: 'wan/2-5-text-to-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt is required',
  },
  {
    id: 'wan/2-6-text-to-video',
    title: 'wan/2-6-text-to-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt'],
    probed: 'This field is required',
  },
  {
    id: 'wan/3-0-video',
    title: 'wan/3-0-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt'],
    probed: 'prompt or media is required',
  },
  {
    id: 'topaz/video-upscale',
    title: 'topaz/video-upscale',
    kind: 'video',
    state: 'live',
    needs: ['video_url'],
    probed: 'video_url is required',
  },
  {
    id: 'infinitalk/from-audio',
    title: 'infinitalk/from-audio',
    kind: 'audio',
    state: 'live',
    needs: ['image_url'],
    probed: 'image_url is required',
  },
  {
    id: 'minimax-h3/text-to-video',
    title: 'minimax-h3/text-to-video',
    kind: 'video',
    state: 'live',
    needs: ['prompt', 'aspect_ratio', 'duration'],
    probed: 'This field is required',
  },
  {
    id: 'omnihuman-1-5',
    title: 'omnihuman-1-5',
    kind: 'lipsync',
    state: 'live',
    needs: ['image_url', 'audio_url'],
    probed: 'This field is required',
  },
  {
    id: 'volcengine/video-to-video-lip-sync',
    title: 'volcengine/video-to-video-lip-sync',
    kind: 'lipsync',
    state: 'live',
    needs: ['mode', 'video_url', 'audio_url'],
    probed: 'This field is required',
  },
  {
    id: 'elevenlabs/audio-isolation',
    title: 'elevenlabs/audio-isolation',
    kind: 'audio',
    state: 'live',
    needs: ['audio_url'],
    probed: 'audio_url is required',
  },
  {
    id: 'elevenlabs/text-to-speech-multilingual-v2',
    title: 'elevenlabs/text-to-speech-multilingual-v2',
    kind: 'audio',
    state: 'live',
    needs: ['text'],
    probed: 'text is required',
  },
  {
    id: 'elevenlabs/text-to-speech-turbo-2-5',
    title: 'elevenlabs/text-to-speech-turbo-2-5',
    kind: 'audio',
    state: 'live',
    needs: ['text'],
    probed: 'text is required',
  },
  {
    id: 'google/gemini-3-1-flash-tts',
    title: 'google/gemini-3-1-flash-tts',
    kind: 'audio',
    state: 'live',
    needs: ['prompt', 'speakers'],
    probed: 'The speakers parameter cannot be empty',
  },
  {
    id: 'sora-2-text-to-video',
    title: 'sora-2-text-to-video',
    kind: 'video',
    state: 'paused',
    needs: [],
    probed: 'This interface is temporarily paused.',
  },
  {
    id: 'sora-2-pro-text-to-video',
    title: 'sora-2-pro-text-to-video',
    kind: 'video',
    state: 'paused',
    needs: [],
    probed: 'This interface is temporarily paused.',
  },
  {
    id: 'sora-2-image-to-video',
    title: 'sora-2-image-to-video',
    kind: 'video',
    state: 'paused',
    needs: [],
    probed: 'This interface is temporarily paused.',
  },
  {
    id: 'veed/fabric-1',
    title: 'veed/fabric-1',
    kind: 'lipsync',
    state: 'live',
    needs: ['image_url'],
    probed: 'image_url is required',
  },
  {
    id: 'gpt-5-2',
    title: 'gpt-5-2',
    kind: 'script',
    state: 'live',
    needs: ['topic'],
    probed:
      'Returned the exact JSON the script route expects: voiceover, cover_prompt, broll_prompts, captions. Asked in Russian, answered in Russian.',
  },
  {
    id: 'gemini-3-pro',
    title: 'gemini-3-pro',
    kind: 'script',
    state: 'live',
    needs: ['topic'],
    probed:
      'Returned the exact JSON the script route expects: voiceover, cover_prompt, broll_prompts, captions. Asked in Russian, answered in Russian.',
  },
  {
    id: 'gemini-2.5-flash',
    title: 'gemini-2.5-flash',
    kind: 'script',
    state: 'live',
    needs: ['topic'],
    probed:
      'Returned the exact JSON the script route expects: voiceover, cover_prompt, broll_prompts, captions. Asked in Russian, answered in Russian.',
  },
  {
    id: 'glm-5.3',
    title: 'glm-5.3',
    kind: 'script',
    state: 'live',
    needs: ['topic'],
    probed:
      'z.ai CODING plan endpoint (/api/coding/paas/v4), not the shared /api/paas/v4 which answers "Insufficient balance" on the same key. Returned the exact script JSON in Russian, with the liveliest captions of the four.',
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

/**
 * Models that accept an EMPTY input and start a billable job.
 *
 * Probing these is not a measurement, it is a purchase. Established the
 * expensive way: `grok-imagine/image-to-video` returned a taskId for `{}`.
 *
 * Anything added here is excluded from every automated probe. When a new model
 * is added to the catalogue, assume it belongs here until a single manual
 * check proves otherwise — the cost of being wrong runs one way only.
 */
/*
 * MODELS NOTHING MAY PROBE WITH AN EMPTY INPUT.
 *
 * grok-imagine earned its place by billing twice for a probe that was
 * supposed to be free.
 *
 * The two GPT Image 2.5 edit models were added on 2026-09-16 BEFORE anything
 * probed them, which is the only moment at which adding them is worth
 * anything. The reasoning is the grok lesson applied forwards rather than
 * backwards: a model that draws for real on a full request is exactly the
 * shape that might create a job on an empty one, and the difference is spent
 * from the owner's balance. Flare was established by a paid run that
 * succeeded; sunburst is not established at all and must stay that way until
 * somebody decides to spend on it deliberately.
 */
export const NEVER_PROBE = [
  'grok-imagine/image-to-video',
  'gpt-image-2-5-flare-image-to-image',
  'gpt-image-2-5-sunburst-image-to-image',
] as const

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
