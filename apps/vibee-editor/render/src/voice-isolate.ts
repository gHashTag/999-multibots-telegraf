/**
 * VOICE ISOLATION: a recording with music under it goes in, the bare voice
 * comes out. The capability the service had no door for.
 *
 * WHY THIS FILE EXISTS AT ALL. Not one of the thirty tools in src/agent/tools.ts
 * accepted an AUDIO FILE as input — audio_generate is text-to-speech and takes
 * a string. So a customer holding a recording had no way to hand it to the
 * service, and the owner's own reference voice was cleaned by hand, on a laptop,
 * with a python venv. A capability that needs someone's shell is not shipped.
 *
 * WHY REPLICATE AND NOT KIE, MEASURED RATHER THAN ASSUMED. Kie is the only
 * funded provider on this account and its market contains EXACTLY ONE id in
 * this space: elevenlabs/audio-isolation. It does not run. Measured here on
 * 2026-09-01 on the owner's real 27.285 s recording, task
 * 7da978d3c0c767106868c1b64075314f:
 *
 *   createTask            HTTP 200, "success", a taskId came back
 *   recordInfo (running)  creditsConsumed 5.4   <- a RESERVATION, not a charge
 *   recordInfo (terminal) state=fail, failCode=500, "internal error, please
 *                         try again later.", costTime EXACTLY 30,
 *                         creditsConsumed 0.0
 *   balance               5648.98 before, 5648.98 after, delta 0.00
 *
 * costTime of exactly 30 with zero credits is this account's documented
 * not-provisioned fingerprint — the same answer veed/fabric-1 and every
 * wan/2-5-* give. It is deterministic, not transient, and the message invites
 * a retry that cannot succeed. The scout measured the identical pair of fields
 * on two runs the day before, so this is now three runs and one fingerprint.
 *
 * ElevenLabs direct is closed too, in its own words: GET /v1/user with the
 * stored key answers HTTP 400 "API key ID used as API key ... API keys start
 * with 'sk_'". The variable holds a key IDENTIFIER, not a key.
 *
 * WHAT ACTUALLY WORKS: ryan5453/demucs on Replicate, and REPLICATE_API_TOKEN is
 * already set on the vibee-render service — the capability was one HTTP call
 * away from a service that already held the credential.
 *
 * THE ENDPOINT IS /v1/predictions WITH A `version`, AND THIS IS NOT COSMETIC.
 * The two Replicate helpers already in render-server.ts (generateImageViaReplicate
 * at :2464, generateAudioViaReplicate at :2524) POST to
 * /v1/models/{owner}/{name}/predictions. Measured 2026-09-01 against this model:
 *
 *   POST /v1/models/ryan5453/demucs/predictions   -> HTTP 404 "not found"
 *   POST /v1/predictions {version, input:{}}      -> HTTP 422 "audio is required"
 *   POST /v1/predictions {version: 64 zeros}      -> HTTP 422 "The specified
 *                                                    version does not exist"
 *
 * The official-model endpoint serves Replicate's OWN models only. Copying the
 * existing helper here would have produced a permanent 404 that reads exactly
 * like a broken model. Those three answers are also what makes a health check
 * for this able to fail: a missing field, a wrong version and a wrong endpoint
 * are three different words, all free.
 *
 * WHY THE DEADLINE IS 300 s AND NOT THE 120 s USED NEXT DOOR. Cold starts on
 * this hardware are minutes, not seconds — the scout measured 168.6 s wall
 * clock for a 15.4 s job, 130 s of it queue. generateAudioViaReplicate's 120 s
 * deadline would abandon a job that then succeeds and is billed anyway.
 *
 * WHY THE BYTES ARE PULLED INTO OUR S3. replicate.delivery links expire within
 * the hour. The same rule the rest of this package pays for: a provider URL in
 * a chat message is not delivery.
 *
 * WHAT THIS FILE DOES NOT DO: charge anybody. The caller charges after this
 * module has returned a file, because a refund is a promise and not charging is
 * a fact.
 */

export const REPLICATE_BASE = 'https://api.replicate.com/v1'

/** The community model. Not one of Replicate's own — see the endpoint note. */
export const ISOLATE_MODEL = 'ryan5453/demucs'

/**
 * The version is PINNED, not resolved at call time.
 *
 * Verified 2026-09-01: GET /v1/models/ryan5453/demucs reports this exact id as
 * `latest_version`, run_count 1,887,388. Pinning costs a stale hash one day and
 * buys the thing that matters more — the separation quality measured below is a
 * property of THIS version. Resolving `latest_version` at call time would let a
 * model update change what customers get with no diff and no test.
 */
export const ISOLATE_VERSION =
  '5a7041cc9b82e5a558fea6b3d7b12dea89625e89da33f0447bd727c2d0ab9e77'

/**
 * Which stem to keep. The model's own enum, read from its schema rather than
 * remembered: none, drums, bass, other, vocals, guitar, piano.
 *
 * 'vocals' is the only one this tool sells, and the others are accepted because
 * refusing them would be a lie about the provider — but the default never moves.
 */
export const STEMS = [
  'vocals',
  'drums',
  'bass',
  'other',
  'guitar',
  'piano',
] as const
export type Stem = (typeof STEMS)[number]

/**
 * htdemucs is a MUSIC source separator trained on singing, not a speech/noise
 * model. It worked on the owner's material — measured, see the tool's block
 * comment — and that is ONE file. Speech over speech, or crowd noise, is a
 * different problem this evidence does not cover.
 */
export const ISOLATE_ARCH = 'htdemucs'

/** Cold start plus queue. See the header: 120 s abandons jobs that are billed. */
export const DEFAULT_TIMEOUT_MS = 300_000

/** Injected so that not one test in this package can reach a network. */
export type Fetch = typeof fetch

/** Bytes into OUR S3. Returns the public URL, throws with the server's words. */
export type Store = (
  bytes: Uint8Array,
  filename: string,
  contentType: string
) => Promise<string>

export interface ReplicateDeps {
  fetchImpl: Fetch
  token: string
  base?: string
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  timeoutMs?: number
  log?: (line: string) => void
}

/**
 * Every way this can end, named. Two words, ok/failed, would hide the one
 * distinction that costs money: a TIMEOUT is not a failure — the prediction is
 * still running and will be billed, so the id must travel back with it.
 */
export type IsolateStage =
  | 'success'
  | 'no-provider'
  | 'bad-input'
  | 'input-refused'
  | 'provider-failed'
  | 'timeout'
  | 'empty-result'
  | 'download-failed'
  | 'store-failed'

export interface IsolateAnswer {
  ok: boolean
  stage: IsolateStage
  /** OUR URL. Present only on success. */
  url?: string
  /** The provider's temporary link, handed back when ours could not be made. */
  providerUrl?: string
  /** The other half of the separation: everything that was removed. */
  removedUrl?: string
  predictionId?: string
  /** GPU seconds Replicate reports. The only cost figure this API exposes. */
  predictSeconds?: number | null
  message: string
}

const sleepDefault = (ms: number) => new Promise(r => setTimeout(r, ms))

async function rep(
  d: ReplicateDeps,
  route: string,
  init: RequestInit = {},
  ms = 60_000
): Promise<{ status: number; json: any; text: string }> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await d.fetchImpl(`${d.base || REPLICATE_BASE}${route}`, {
      ...init,
      signal: c.signal,
      headers: {
        Authorization: `Bearer ${d.token}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    })
    const text = await r.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      /* keep the text: it is still the only evidence the caller will get */
    }
    return { status: r.status, json, text }
  } catch (e: any) {
    return { status: 0, json: null, text: String(e?.message || e) }
  } finally {
    clearTimeout(t)
  }
}

/**
 * IS THERE A PROVIDER AT ALL — asked before anything is taken, and answered
 * with the name of the missing thing.
 *
 * "Voice isolation is unavailable" sends a person to support. "The service has
 * no REPLICATE_API_TOKEN" sends them to the one field that fixes it. The
 * difference is the whole point of this function existing separately from the
 * call it guards.
 */
export function providerRefusal(token: string | undefined): string | null {
  if (!token || !token.trim())
    return (
      'провайдер очистки голоса не настроен в сервисе: нет REPLICATE_API_TOKEN. ' +
      'Единственный id очистки у Kie — elevenlabs/audio-isolation — на этом ' +
      'аккаунте не выполняется (state=fail, failCode=500, costTime ровно 30, ' +
      'списано 0 кредитов, замерено 2026-09-01), а ключ ElevenLabs в переменной ' +
      'является идентификатором ключа, а не ключом. Ничего не списано'
    )
  return null
}

/**
 * IS THIS EVEN A FETCHABLE FILE — free, and it runs before the provider is paid.
 *
 * Providers in this stack decide whether a thing is audio by READING THE URL,
 * not the bytes: Kie's omnihuman refused the string "not-a-url" before it had
 * fetched anything. A caller who pastes a filename instead of a link should be
 * told so for nothing rather than after a GPU has spun up.
 */
export function badInput(audioUrl: string): string | null {
  const u = String(audioUrl || '').trim()
  if (!u) return 'не указан файл: нужен audio_url (http/https ссылка на запись)'
  if (!/^https?:\/\//i.test(u))
    return `audio_url должен быть http(s)-ссылкой, а не «${u.slice(0, 60)}»`
  return null
}

/**
 * Submit. A prediction id coming back means GPU time is now committed.
 *
 * Split from polling on purpose: the id has to reach the caller the instant it
 * exists, so that a lost answer is a lookup and not a second purchase.
 */
export async function startIsolation(
  d: ReplicateDeps,
  o: { audioUrl: string; stem?: Stem; arch?: string; version?: string }
): Promise<{ id?: string; refusal?: string }> {
  const created = await rep(d, '/predictions', {
    method: 'POST',
    body: JSON.stringify({
      version: o.version || ISOLATE_VERSION,
      input: {
        audio: o.audioUrl,
        stem: o.stem || 'vocals',
        model: o.arch || ISOLATE_ARCH,
        output_format: 'wav',
        // int24 rather than the default: this file's whole purpose is to be a
        // clean reference, and the next stage may be a voice cloner.
        wav_format: 'int24',
      },
    }),
  })
  const id = created.json?.id
  if (typeof id === 'string' && id) return { id }
  // 422 here is the discriminating answer, not a generic failure: it names the
  // field or says the version does not exist. Both are free and both are bugs
  // in US, so they must reach a log verbatim rather than as "provider error".
  return {
    refusal: String(
      created.json?.detail || created.json?.title || created.text
    ).slice(0, 300),
  }
}

/** One status read. Exposed so a recovery path can poll an id it never sent. */
export async function pollOnce(
  d: ReplicateDeps,
  id: string
): Promise<{ status: string; output: any; error: any; predictSeconds: number | null }> {
  const r = await rep(d, `/predictions/${encodeURIComponent(id)}`, {
    method: 'GET',
  })
  const j = r.json || {}
  const pt = j?.metrics?.predict_time
  return {
    status: String(j.status || ''),
    output: j.output,
    error: j.error,
    predictSeconds: typeof pt === 'number' ? pt : null,
  }
}

/**
 * The stem URL out of an output whose SHAPE IS NOT IN THE SCHEMA.
 *
 * GET /v1/models/ryan5453/demucs reports `Output: {"type": "object"}` and
 * nothing more — the provider does not document its own keys. So the shape is
 * taken from a real run ({vocals, no_vocals}) and everything else is handled
 * defensively rather than trusted: a string, an array, or an object with the
 * stem's own name. A wrong guess here would hand the customer the MUSIC.
 */
export function pickStem(
  output: unknown,
  stem: string
): { kept?: string; removed?: string } {
  if (typeof output === 'string') return { kept: output }
  if (Array.isArray(output)) {
    const first = output.find(v => typeof v === 'string')
    return first ? { kept: first as string } : {}
  }
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    const kept = typeof o[stem] === 'string' ? (o[stem] as string) : undefined
    // demucs names the complement `no_<stem>`; keeping it is what lets a person
    // hear WHAT WAS REMOVED, which is the only honest way to judge a separation.
    const removedKey = `no_${stem}`
    const removed =
      typeof o[removedKey] === 'string' ? (o[removedKey] as string) : undefined
    if (kept) return { kept, removed }
    const anyUrl = Object.values(o).find(v => typeof v === 'string')
    return anyUrl ? { kept: anyUrl as string } : {}
  }
  return {}
}

/**
 * Poll to a verdict.
 *
 * A deadline reached is reported as `timeout` WITH the id, never as a failure:
 * Replicate bills the GPU seconds whether or not we were still listening, and
 * "it failed" invites the caller to buy the same separation again.
 */
export async function pollToDeadline(
  d: ReplicateDeps,
  id: string,
  stem: string
): Promise<IsolateAnswer> {
  const sleep = d.sleep || sleepDefault
  const step = d.pollMs ?? 3_000
  const deadline = Date.now() + (d.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let seen = ''
  while (Date.now() < deadline) {
    await sleep(step)
    const s = await pollOnce(d, id)
    if (s.status && s.status !== seen) {
      seen = s.status
      d.log?.(`[voice] ${id} ${s.status}`)
    }
    if (s.status === 'succeeded') {
      const { kept, removed } = pickStem(s.output, stem)
      if (!kept)
        return {
          ok: false,
          stage: 'empty-result',
          predictionId: id,
          predictSeconds: s.predictSeconds,
          message: `провайдер сказал succeeded, но не отдал дорожку «${stem}»`,
        }
      return {
        ok: true,
        stage: 'success',
        providerUrl: kept,
        removedUrl: removed,
        predictionId: id,
        predictSeconds: s.predictSeconds,
        message: 'готово',
      }
    }
    if (s.status === 'failed' || s.status === 'canceled')
      return {
        ok: false,
        stage: 'provider-failed',
        predictionId: id,
        predictSeconds: s.predictSeconds,
        message: `провайдер не справился: ${String(s.error || s.status).slice(0, 200)}`,
      }
  }
  return {
    ok: false,
    stage: 'timeout',
    predictionId: id,
    message:
      `провайдер не ответил за ${Math.round((d.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 1000)} с. ` +
      `Задача ещё считается и уже оплачена — не запускай заново, спроси по id ${id}`,
  }
}

/**
 * The whole leg: submit, wait, pull the bytes, put them in OUR storage.
 *
 * `store` is injected rather than imported so that the tests exercise this
 * function itself, not a mock of it, and so that not one of them can reach S3.
 */
export async function isolateVoice(
  d: ReplicateDeps,
  o: { audioUrl: string; stem?: Stem; store: Store; filename?: string }
): Promise<IsolateAnswer> {
  const bad = badInput(o.audioUrl)
  if (bad) return { ok: false, stage: 'bad-input', message: bad }

  const refusal = providerRefusal(d.token)
  if (refusal) return { ok: false, stage: 'no-provider', message: refusal }

  const stem = o.stem || 'vocals'
  const started = await startIsolation(d, { audioUrl: o.audioUrl, stem })
  if (!started.id)
    return {
      ok: false,
      stage: 'input-refused',
      message: `провайдер не принял задачу: ${started.refusal}`,
    }

  const answer = await pollToDeadline(d, started.id, stem)
  if (!answer.ok || !answer.providerUrl) return answer

  // The provider link dies within the hour. Everything below is what turns
  // "the provider returned a URL" into a file this service owns.
  let bytes: Uint8Array
  try {
    const got = await d.fetchImpl(answer.providerUrl)
    if (!got.ok)
      return {
        ...answer,
        ok: false,
        stage: 'download-failed',
        message: `дорожка готова, но не скачалась: HTTP ${got.status}`,
      }
    bytes = new Uint8Array(await got.arrayBuffer())
  } catch (e: any) {
    return {
      ...answer,
      ok: false,
      stage: 'download-failed',
      message: `дорожка готова, но не скачалась: ${String(e?.message || e).slice(0, 160)}`,
    }
  }

  try {
    const url = await o.store(
      bytes,
      o.filename || `voice-clean-${Date.now()}.wav`,
      'audio/wav'
    )
    return { ...answer, ok: true, stage: 'success', url }
  } catch (e: any) {
    return {
      ...answer,
      ok: false,
      stage: 'store-failed',
      message: `дорожка готова, но не сохранилась: ${String(e?.message || e).slice(0, 160)}`,
    }
  }
}
