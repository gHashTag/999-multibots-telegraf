import { kieInputFor } from './agent/kie-web-provider'
/**
 * IMAGE-TO-IMAGE, the capability the service sells but did not have.
 *
 * whoami told every agent, in its own words, that turning a photo into a
 * picture was impossible here and that image_generate takes text only, and
 * instructed the agent not to promise it. That sentence was true, and it was
 * the single biggest hole in a product whose whole promise is a story about
 * YOU: without img2img the owner's own face cannot enter a single frame.
 *
 * WHY KIE AND NOT THE EXISTING PROVIDERS. Measured 2026-08-31: FAL answers HTTP
 * 403 "User is locked. Reason: Exhausted balance", and the ElevenLabs variable
 * holds a key identifier rather than a key. Kie is the only funded provider on
 * the account, and its catalogue covers fifteen function categories.
 *
 * WHICH MODEL, AND WHY IT IS NOT THE MOST EXPENSIVE ONE. Seven generations were
 * run on the owner's real avatar with one prompt, and the result contradicts
 * the marketing ranking:
 *
 *   google/nano-banana-edit  KEEPS the face (bald head, beard, glasses) - used
 *   qwen/image-edit          keeps the face, ignores aspect_ratio
 *   nano-banana-pro          prettier, 2K - and REPLACES him with a generic
 *                            17th-century face
 *   nano-banana-2 / -lite    same replacement, cheaper
 *
 * So the "better" model is worse for this product: an editing model edits the
 * person, a generation model treats the photo as a style reference. Cost of the
 * whole comparison: 58 credits, about $0.29.
 *
 * THE ENDPOINT IS recordInfo, NOT taskStatus. src/core/lipsync/providers/
 * kie-veed-fabric-provider.ts polls .../jobs/taskStatus in three places, and
 * that path answers HTTP 404 -- every Kie lipsync job in the bot would poll a
 * dead address until it timed out. Measured the same day against a real task.
 */

const BASE = 'https://api.kie.ai/api/v1'

/** The model that preserves the person. See the block comment for the evidence. */
export const EDIT_MODEL = 'google/nano-banana-edit'

/**
 * GPT IMAGE 2.5 (OpenAI via Kie), the owner's choice for the CRM lead magnet.
 *
 * Two API variants, same contract. Documented 2026-09-13 at
 * docs.kie.ai/market/gpt/gpt-image-2-5-{flare,sunburst}-image-to-image:
 * `input.prompt` (<= 20 000 chars), `input.input_urls` (<= 16 URIs),
 * `input.aspect_ratio` (enum incl. 9:16, default auto), `input.resolution`
 * (1K | 2K | 4K). The source is named `input_urls` here and `image_urls` on
 * nano-banana -- one form for both would be refused by one of them.
 *
 * Price, read from the Kie price list the same day (POST
 * api.kie.ai/client/v1/model-pricing/page): image-to-image 1K = 6 credits =
 * $0.03 per image, 2K = $0.05, 4K = $0.08. nano-banana-edit is $0.02.
 *
 * STATUS: RUN, 2026-09-16, at the owner's word ("запусти подарок за $0.03").
 * The first live call to this model from this code base, on the owner's own
 * avatar so that nothing reached a client: 75 seconds, a 941x1672 PNG (9:16
 * to within a pixel), face preserved and framed in the central third the way
 * the suffix asks. It cost SIX credits -- which is the price read from the
 * price list above, confirmed to the unit rather than merely believed.
 *
 * Two things the run settled that reading could not. The contract holds: this
 * model really does want `input_urls` where nano-banana wants `image_urls`,
 * and editInputFor already sends the right one. And the 12 tokens the gift
 * charges a recipient are not a guess -- the charge came back as 12.
 *
 * NOT probed by the free empty-input method the catalogue was built with.
 * That method has a named hole three paragraphs into kie-models.ts:
 * grok-imagine answered an empty input by CREATING a billable job. A model
 * that draws for real on a full request is exactly the shape that might do
 * the same on an empty one, and guessing costs the owner money. A paid run
 * that succeeded is the stronger evidence anyway.
 *
 * `sunburst` remains unrun. It is the premium sibling, and nothing needs it
 * yet.
 */
export const GPT_IMAGE_25_EDIT_MODELS = [
  'gpt-image-2-5-flare-image-to-image',
  'gpt-image-2-5-sunburst-image-to-image',
] as const
/** Flare is Kie's stated default for creator/social visuals; Sunburst is the premium one. */
export const LEAD_MAGNET_MODEL: (typeof GPT_IMAGE_25_EDIT_MODELS)[number] =
  'gpt-image-2-5-flare-image-to-image'
/** 1K is the priced tier the lead magnet is budgeted at ($0.03). */
export const LEAD_MAGNET_RESOLUTION = '1K'

export function isGptImage25Edit(model: string): boolean {
  return (GPT_IMAGE_25_EDIT_MODELS as readonly string[]).includes(model)
}

/**
 * The `input` object for an edit, BY THE MODEL'S OWN CONTRACT.
 *
 * Exported so a test can check the shape without a network: sending
 * `image_urls` to GPT Image 2.5 would be a refusal discovered only after a
 * person pressed the button and waited.
 */
export function editInputFor(
  model: string,
  opts: { prompt: string; imageUrl: string; aspectRatio?: string }
): Record<string, unknown> {
  const aspect_ratio = opts.aspectRatio || '9:16'
  if (isGptImage25Edit(model)) {
    return {
      prompt: opts.prompt,
      input_urls: [opts.imageUrl],
      aspect_ratio,
      resolution: LEAD_MAGNET_RESOLUTION,
    }
  }
  return { prompt: opts.prompt, image_urls: [opts.imageUrl], aspect_ratio }
}

/**
 * TEXT-TO-IMAGE, the leg that brings the factory's engraving back.
 *
 * WHICH MODEL, AND WHY NOT THE PRETTIER ONE. Measured 2026-08-31 by generating
 * the same engraving prompt once per model and reading the credit delta:
 *
 *   google/nano-banana     4 credits  768x1344 PNG  - exactly 9:16, used
 *   nano-banana-2-lite     4 credits  768x1376 JPEG - 32 px off a reel frame
 *   nano-banana-2          8 credits
 *   nano-banana-pro       18 credits  - prettier faces, and this poster has
 *                                       no face in it at all
 *   google/imagen4(-fast)  0 credits  - "Internal Error", never serves here
 *
 * The tie on price is broken by the only thing that matters downstream: the
 * frame. 768x1344 drops into a 1080x1920 reel with no crop; 768x1376 does not.
 * And the imagen pair is the reason a free id probe is not enough -- both pass
 * "does this model exist" and fail every real generation. Exists is not works.
 *
 * CORRECTION, MEASURED END TO END ON 2026-08-31 THROUGH THE REAL ROUTE. The
 * frame argument above is sound about the MODEL but does not describe what the
 * factory actually asks for, so do not rely on it when picking the next model:
 *
 *   - The autopilot calls image_generate with {height: 1536} and no width, so
 *     the route's getAspectRatio sees 1024x1536, whose ratio 1.5 fails its
 *     `>= 1.7` test for 9:16 and yields 3:4. A real run returned 864x1184 PNG,
 *     not 768x1344. The production path never requests 9:16 at all.
 *   - It does not matter here, and that is the point: posterUrl feeds the oval
 *     Medallion of TrinityBlogReel (TrinityBlogReel.tsx:812-826), which crops
 *     to an oval, so "no crop in a 1080x1920 frame" is a property of a use this
 *     image does not have.
 *
 * The choice of google/nano-banana still stands on the half that was verified:
 * cheapest at 4 credits AND actually serves. Cost of the end-to-end proof:
 * 6822.53 -> 6818.53, exactly 4.00 credits.
 */
export const T2I_MODEL = 'google/nano-banana'

export type KieResult =
  | { ok: true; url: string; taskId: string; credits: number | null }
  | { ok: false; reason: string; taskId?: string }

function key(): string {
  return process.env.KIE_AI_API_KEY || ''
}

async function api(path: string, init: RequestInit = {}, ms = 30_000) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      signal: c.signal,
      headers: {
        Authorization: `Bearer ${key()}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
    const text = await r.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      /* keep the text: it is still evidence for the caller's log */
    }
    return { status: r.status, json, text }
  } catch (e: any) {
    return { status: 0, json: null, text: String(e?.message || e) }
  } finally {
    clearTimeout(t)
  }
}

/** Free, and the only endpoint that answers for balance. */
export async function credits(): Promise<number | null> {
  const r = await api('/chat/credit', { method: 'GET' }, 15_000)
  const v = r.json?.data
  return typeof v === 'number' ? v : null
}

/**
 * Create a Kie job, poll it to a verdict, return the URL and what it cost.
 *
 * Extracted from editImage when text-to-image was added: everything below the
 * `input` object is provider protocol, not model semantics, and the two facts
 * that cost money to learn -- the status endpoint is recordInfo, and a timeout
 * is not a refund -- must not exist in two copies that can drift apart.
 */
async function runKieJob(opts: {
  model: string
  input: Record<string, unknown>
  timeoutMs?: number
}): Promise<KieResult> {
  if (!key()) return { ok: false, reason: 'KIE_AI_API_KEY не задан в сервисе' }

  const before = await credits()
  const created = await api('/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify({ model: opts.model, input: opts.input }),
  })
  const taskId = created.json?.data?.taskId || created.json?.data?.task_id
  if (!taskId) {
    const msg = String(
      created.json?.msg || created.json?.message || created.text
    ).slice(0, 200)
    return { ok: false, reason: `Kie не принял задачу: ${msg}` }
  }

  const deadline = Date.now() + (opts.timeoutMs ?? 180_000)
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4_000))
    // recordInfo, not taskStatus -- see the block comment at the top.
    const st = await api(`/jobs/recordInfo?taskId=${taskId}`, { method: 'GET' })
    const d = st.json?.data
    const state = String(d?.state || '')
    if (state === 'success') {
      let urls: string[] = []
      try {
        urls = JSON.parse(d.resultJson || '{}').resultUrls || []
      } catch {
        /* fall through to the empty-result refusal below */
      }
      if (!urls.length)
        return { ok: false, reason: 'Kie сказал success без файла', taskId }
      const after = await credits()
      return {
        ok: true,
        url: urls[0],
        taskId,
        credits: before != null && after != null ? before - after : null,
      }
    }
    if (state === 'fail' || state === 'failed') {
      return {
        ok: false,
        reason: `Kie отказал: ${String(d?.failMsg || 'без причины').slice(0, 200)}`,
        taskId,
      }
    }
  }
  // A timeout is NOT a failure of the generation: the task may still finish and
  // the credits are already spent. Say so, and hand back the id so the caller
  // can look it up rather than paying twice.
  return {
    ok: false,
    reason:
      'Kie не ответил за отведённое время. Задача может ещё выполняться — ' +
      `кредиты уже списаны, id задачи ${taskId}`,
    taskId,
  }
}

/**
 * Edit an image, wait for it, return the URL.
 *
 * `aspect_ratio` defaults to 9:16 deliberately. Without it the edit models
 * return landscape -- measured: 1344x768 -- which is unusable in a reel and
 * would be discovered only after the render looked wrong.
 */
export async function editImage(opts: {
  prompt: string
  imageUrl: string
  aspectRatio?: string
  model?: string
  timeoutMs?: number
}): Promise<KieResult> {
  const model = opts.model || EDIT_MODEL
  return runKieJob({
    model,
    input: editInputFor(model, opts),
    timeoutMs: opts.timeoutMs,
  })
}

/**
 * Draw an image from text alone: the last leg of the poster chain.
 *
 * Same explicit `aspect_ratio` rule as editImage, and for the same measured
 * reason -- the default is landscape, and a landscape poster is only
 * discovered after the reel has already been rendered around it.
 */
export async function generateImage(opts: {
  prompt: string
  aspectRatio?: string
  model?: string
  timeoutMs?: number
  /** Исходник для моделей правки. Без него они просто не допущены. */
  imageUrl?: string
}): Promise<KieResult> {
  const модель = opts.model || T2I_MODEL
  /**
   * Вход собираем ПО КОНТРАКТУ модели, а не одной формой на всех.
   *
   * Здесь безусловно уходили `prompt` и `aspect_ratio`. Для допущенной ранее
   * единственной модели это совпадало; после открытия каталога — уже нет.
   * Часть моделей `aspect_ratio` требует (`google/imagen4` отвечает
   * «aspect_ratio cannot be empty»), часть о нём не просила вовсе, а лишнее
   * поле у некоторых само по себе повод для отказа.
   *
   * `null` означает, что модель просит поле, которого у нас нет. Отказываем
   * ДО обращения к провайдеру: заведомо неполный запрос всё равно вернёт
   * отказ, только уже после ожидания.
   */
  /**
   * Предлагаем БОЛЬШЕ, чем нужно любой одной модели: сборщик возьмёт ровно то,
   * что назвал контракт, и отбросит остальное.
   *
   * `quality` здесь потому, что обе модели seedream требуют его, а узнать это
   * из API было нельзя — оно отвечало «This field is required», не называя
   * поле. Значение `basic` — задокументированное умолчание провайдера (1K;
   * `high` даёт 2K и стоит дороже), а не наша выдумка: выдумывать значения
   * сборщику запрещено, поэтому известные умолчания живут ЗДЕСЬ, у вызова,
   * где видно, за что человек платит.
   */
  const вход = kieInputFor(модель, {
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio || '9:16',
    quality: 'basic',
    // Одна и та же ссылка под тремя именами: контракты моделей называют
    // исходник по-разному, а `kieInputFor` возьмёт только то, что просят.
    // Без исходника поля остаются undefined — и модель, которая его требует,
    // получит null вместо заявки, то есть честный отказ вместо мусора.
    ...(opts.imageUrl
      ? {
          image_urls: [opts.imageUrl],
          image_url: opts.imageUrl,
          image: opts.imageUrl,
        }
      : {}),
  })
  if (!вход) {
    return {
      ok: false,
      reason: `модель ${модель} просит поля, которых у нас нет`,
    } as KieResult
  }
  return runKieJob({
    model: модель,
    input: вход,
    timeoutMs: opts.timeoutMs,
  })
}
