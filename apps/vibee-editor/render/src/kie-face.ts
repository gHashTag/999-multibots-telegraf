/**
 * THE TALKING HEAD: the caller's own face saying a given text.
 *
 * THREE CALLS, NOT ONE, AND THE ORDER IS THE WHOLE DESIGN:
 *
 *   1. Kie TTS turns the text into speech.       ~1 credit, and it is the
 *                                                 cheapest thing here by two
 *                                                 orders of magnitude.
 *   2. WE MEASURE THE SPEECH OURSELVES and price the clip from that number.
 *   3. omnihuman-1-5 animates the portrait.      ~26 credits PER SECOND.
 *
 * WHY STEP 2 EXISTS AT ALL. omnihuman is billed by the length of the audio it
 * is given, and the audio does not exist until we have made it. So the price of
 * the expensive call is unknowable until after the cheap call — and knowable
 * exactly before it. That single fact is what makes a real ceiling possible
 * instead of a guess: this module spends about one credit to learn what the
 * next call would cost, and refuses out loud when the answer is too much.
 *
 * WHY THE MEASUREMENT IS BYTES AND NOT A FIELD IN THE ANSWER. recordInfo
 * carries NO DURATION. Measured on a real successful TTS record on 2026-08-31:
 * `resultJson` was exactly {"resultUrls":[...]} and nothing else. Asking Kie how
 * long the speech is is not an option, so the header is read here.
 *
 * WHY NO ffmpeg. Kie TTS returns UNCOMPRESSED PCM WAV (RIFF/WAVE, format 1,
 * mono, 24000 Hz, 16-bit), so duration = dataSize / byteRate in pure
 * arithmetic. ffmpeg IS in render/Dockerfile, so an ffprobe path would also
 * ship — but a subprocess cannot be unit-tested with a 44-byte fixture, and a
 * base-image change cannot break arithmetic. Cross-checked on a real file:
 * this reader said 7.400 s where ffprobe said 7.400000.
 *
 * WHY THE FIELD LIST OF omnihuman WAS NOT ASSUMED. kie-models.ts recorded it
 * with `needs: []`, because all three of the free probes (`{}`, image_url only,
 * audio_url only) answer the identical opaque `{"code":500,"msg":"This field is
 * required"}` — a validator that refuses WITHOUT NAMING THE FIELD is the second
 * hole in the free-probe method, and it was open on the one model that costs 26
 * credits a second. Measured here on 2026-09-01, balance 5972.57 before and
 * after, 0 credits:
 *
 *   {prompt}                                  -> "This field is required"
 *   {image_url, audio_url:"not-a-url"}        -> "File type not supported"
 *   {image_url, audio_url, prompt}            -> "File type not supported"
 *
 * The second line is the finding: the validator walked PAST the required-field
 * check and got as far as inspecting the audio, so image_url + audio_url is the
 * complete required set and `prompt` is not part of it. kie-models.ts now says
 * so, and kie-run.ts's guard is no longer inert for this model.
 *
 * WHY THE AUDIO IS RE-HOSTED IN OUR S3 BEFORE THE PROVIDER SEES IT. Two
 * reasons, both already paid for elsewhere in this package: a provider link
 * expires within the hour, and providers decide whether a file is audio by
 * READING THE URL'S EXTENSION rather than the bytes — the probe above refuses
 * `not-a-url` before it has fetched anything at all. Our /upload keeps the
 * filename, so the `.wav` survives.
 *
 * WHY THE CHARGE IS NOT IN THIS FILE. Nothing here takes money from a person.
 * The caller charges after this module has returned, because a refund is a
 * promise and not charging is a fact — the rule src/agent/tools.ts image_edit
 * started and src/reel-chain.ts stated.
 */

export const KIE_BASE = 'https://api.kie.ai/api/v1'
export const TTS_MODEL = 'google/gemini-3-1-flash-tts'
export const FACE_MODEL = 'omnihuman-1-5'

/**
 * What a second of face costs, in Kie credits.
 *
 * The owner measured it twice on real jobs: 81 credits for 3.2 s (25.3/s) and
 * 324 for 12.36 s (26.2/s). 26 is the planning number. It is a PLANNING number
 * and never a reported one: what a job actually cost is read from
 * recordInfo.creditsConsumed, and `priceDrift` below shouts when the two
 * disagree, because a constant that has silently gone wrong is how a ceiling
 * stops bounding anything.
 */
export const CREDITS_PER_SECOND = 26

/**
 * THE CEILING, IN SECONDS OF FACE, AND WHY THESE TWO NUMBERS.
 *
 * 8 s x 26 = 208 credits: 3.5% of the measured balance (5972.57) and about 52
 * `image_edit` calls — the shipped customer tool that shares this purse. It is
 * also not a new number: src/talking-portrait.ts derived MAX_SECONDS = 8
 * independently for the same balance, and two ceilings that can drift apart are
 * worse than one that is merely arguable.
 *
 * 12 s is the hard stop no argument may pass: the owner's own measurement of a
 * 12.36 s clip was 324 credits, 5.4% of the balance in one call.
 */
export const DEFAULT_MAX_SECONDS = 8
export const HARD_MAX_SECONDS = 12

/**
 * A free pre-gate on the TEXT, deliberately loose.
 *
 * Measured today's TTS at 14.59 characters per second (108 characters ->
 * 7.400 s). This gate is set at 25 — nearly double — because its job is only to
 * stop a pasted essay before a credit is spent, not to predict the duration.
 * The real gate is the measured one, and a tight pre-gate here would refuse
 * texts the real gate would have allowed.
 */
export const MAX_CHARS_PER_SECOND = 25

/**
 * Credits left untouched for `image_edit`, about 240 customer edits.
 *
 * Same floor and same reason as src/talking-portrait.ts: the factory may not
 * starve the product a human actually touches.
 */
export const CREDIT_FLOOR = 2000

/** Injected so that not one test in this package can reach a network. */
export type Fetch = typeof fetch

/** Bytes into OUR S3. Returns the public URL, throws with the provider's words. */
export type Store = (
  bytes: Uint8Array,
  filename: string,
  contentType: string
) => Promise<string>

export interface KieDeps {
  fetchImpl: Fetch
  key: string
  base?: string
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  timeoutMs?: number
  log?: (line: string) => void
}

/* ------------------------------------------------------------ wav duration */

/**
 * Seconds of audio in a RIFF/WAVE file, from its header alone.
 *
 * Returns null for anything it cannot read with certainty, and the caller turns
 * that into a refusal rather than a guess — because the only use of this number
 * is to decide whether to spend two hundred credits, and a wrong small number
 * spends them.
 *
 * TRUNCATION IS A REFUSAL, NOT A SHORTER FILE. If the `data` chunk declares
 * more bytes than arrived, this returns null instead of measuring what is
 * present. Measuring what is present would UNDER-report the duration of a
 * partial download, sail through the ceiling, and then be billed for the full
 * clip the provider re-fetches. Over-reporting is safe; under-reporting is the
 * one direction that costs money.
 */
export function readWavSeconds(bytes: Uint8Array): number | null {
  if (bytes.length < 12) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (at: number) =>
    String.fromCharCode(
      bytes[at],
      bytes[at + 1],
      bytes[at + 2],
      bytes[at + 3]
    )
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null

  let byteRate = 0
  // A real WAV puts LIST/fact chunks between `fmt ` and `data`, so this walks
  // the chunk list rather than assuming the canonical 44-byte layout.
  let at = 12
  while (at + 8 <= bytes.length) {
    const id = tag(at)
    const size = view.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      if (size < 16 || body + 16 > bytes.length) return null
      byteRate = view.getUint32(body + 8, true)
    } else if (id === 'data') {
      if (!byteRate) return null // `data` before `fmt `: unreadable, not zero
      if (body + size > bytes.length) return null // truncated — see above
      return size / byteRate
    }
    // Chunk bodies are padded to an even length; the pad byte is not counted
    // in `size`, and skipping it desynchronises every chunk after it.
    at = body + size + (size % 2)
  }
  return null
}

/* ------------------------------------------------------------------- calls */

/**
 * The five-way outcome, lifted from src/reel-chain.ts, and the reason it is
 * five and not two: `credits` here is recordInfo.creditsConsumed and never a
 * balance delta. This account runs concurrent work — the balance moved during a
 * run that created no task at all — so a before/after subtraction charges other
 * people's spend to this job.
 */
export type JobStage =
  | 'success'
  | 'input-refused'
  | 'provider-failed'
  | 'timeout'
  | 'empty-result'

export interface JobAnswer {
  ok: boolean
  stage: JobStage
  url?: string
  taskId?: string
  credits: number | null
  message: string
}

async function kieCall(
  d: KieDeps,
  route: string,
  init: RequestInit,
  ms = 30_000
): Promise<{ status: number; json: any; text: string }> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await d.fetchImpl(`${d.base || KIE_BASE}${route}`, {
      ...init,
      signal: c.signal,
      headers: {
        Authorization: `Bearer ${d.key}`,
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

/** Balance. Free, and the only endpoint that answers for it. */
export async function kieCredits(d: KieDeps): Promise<number | null> {
  const r = await kieCall(d, '/chat/credit', { method: 'GET' }, 15_000)
  const v = r.json?.data
  return typeof v === 'number' ? v : null
}

/**
 * Submit a job. A taskId coming back means credits are now committed.
 *
 * Split from the polling on purpose: `wait: false` has to return the id to the
 * caller the instant it exists, and the recovery tool has to be able to poll an
 * id it never submitted.
 */
export async function createTask(
  d: KieDeps,
  model: string,
  input: Record<string, unknown>
): Promise<{ taskId?: string; refusal?: string }> {
  const created = await kieCall(d, '/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify({ model, input }),
  })
  const taskId = created.json?.data?.taskId || created.json?.data?.task_id
  if (taskId) return { taskId: String(taskId) }
  return {
    refusal: String(
      created.json?.msg || created.json?.message || created.text
    ).slice(0, 300),
  }
}

/**
 * One look at a task. Polling is free.
 *
 * recordInfo, NEVER taskStatus: /jobs/taskStatus answers HTTP 404 on this
 * account, and the bot's own lipsync provider polls it in three places, so
 * every Kie lipsync job there waits on a dead address until it times out.
 */
export async function pollOnce(
  d: KieDeps,
  taskId: string
): Promise<JobAnswer | null> {
  const st = await kieCall(
    d,
    `/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
    { method: 'GET' }
  )
  const data = st.json?.data
  const state = String(data?.state || '')
  const credits =
    typeof data?.creditsConsumed === 'number' ? data.creditsConsumed : null
  if (state === 'success') {
    let urls: string[] = []
    try {
      urls = JSON.parse(data.resultJson || '{}').resultUrls || []
    } catch {
      /* an unparsable result is an empty result; the caller refuses */
    }
    if (!urls.length)
      return {
        ok: false,
        stage: 'empty-result',
        taskId,
        credits,
        message: 'Kie сказал success без файла',
      }
    return {
      ok: true,
      stage: 'success',
      url: String(urls[0]),
      taskId,
      credits,
      message: 'ok',
    }
  }
  if (state === 'fail' || state === 'failed')
    return {
      ok: false,
      stage: 'provider-failed',
      taskId,
      // Measured 9/9 on this account: a provider-side failure is billed 0. Read
      // from the answer anyway — an assumption about money is not a measurement.
      credits,
      message: String(data?.failMsg || 'без причины').slice(0, 300),
    }
  return null // still working
}

/** Submit, then poll to a deadline. */
export async function runKieJob(
  d: KieDeps,
  model: string,
  input: Record<string, unknown>
): Promise<JobAnswer> {
  const started = await createTask(d, model, input)
  if (!started.taskId)
    return {
      ok: false,
      stage: 'input-refused',
      credits: 0,
      message: started.refusal || 'Kie отказал без сообщения',
    }
  return pollToDeadline(d, started.taskId)
}

export async function pollToDeadline(
  d: KieDeps,
  taskId: string
): Promise<JobAnswer> {
  const sleep = d.sleep || ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const timeoutMs = d.timeoutMs ?? 360_000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(d.pollMs ?? 4_000)
    const answer = await pollOnce(d, taskId)
    if (answer) return answer
  }
  return {
    ok: false,
    stage: 'timeout',
    taskId,
    // A timeout is NOT a refund. The task may still finish and be billed, which
    // is why the caller must have written this id down before we got here.
    credits: null,
    message: `Kie не ответил за ${Math.round(timeoutMs / 1000)} с, задача ${taskId}`,
  }
}

/**
 * One voice-over from one text.
 *
 * The contract was found by reading refusals, free, because the published docs
 * are wrong about it: `speakers` is a list of OBJECTS with `speaker_id` matching
 * "Speaker N" (N from 1) and a CASE-SENSITIVE `voice_name`; `dialogue_turns` is
 * a list of objects referencing a declared speaker. Bare strings in
 * dialogue_turns crash the server rather than being refused.
 */
export async function speak(
  d: KieDeps,
  opts: { text: string; voiceName?: string; style?: string; pace?: string }
): Promise<JobAnswer> {
  return runKieJob(d, TTS_MODEL, {
    speakers: [
      {
        speaker_id: 'Speaker 1',
        voice_name: opts.voiceName || 'Zephyr',
        ...(opts.style ? { style: opts.style } : {}),
        ...(opts.pace ? { pace: opts.pace } : {}),
      },
    ],
    dialogue_turns: [{ speaker_id: 'Speaker 1', text: opts.text }],
    temperature: 1,
  })
}

/* --------------------------------------------------------------- the plan */

export type PrepareRefusal =
  | 'no-key'
  | 'text-too-long'
  | 'tts-failed'
  | 'audio-unreadable'
  | 'over-ceiling'
  | 'low-balance'
  | 'store-failed'

export interface Prepared {
  ok: true
  /** Our copy, `.wav`, the one the provider will be given. */
  audioUrl: string
  seconds: number
  /** seconds x CREDITS_PER_SECOND, rounded up. What the face WILL cost. */
  plannedCredits: number
  /** What has already been spent getting here. TTS only, about one credit. */
  spentCredits: number
  ceilingSeconds: number
}

export interface PrepareRefused {
  ok: false
  stage: PrepareRefusal
  reason: string
  seconds?: number
  wouldCost?: number
  /** Credits gone before the refusal. Zero for every free refusal. */
  spentCredits: number
}

export function priceOfSeconds(seconds: number): number {
  return Math.ceil(seconds * CREDITS_PER_SECOND)
}

/**
 * Seconds as a person reads them, rounded UP.
 *
 * toFixed(2) rounds to nearest, so a clip of 8.001 s printed beside a ceiling
 * of 8 reads "речь вышла 8.00 с при потолке 8 с" — a refusal that looks like a
 * bug and invites the caller to retry the identical text. Rounding up can never
 * understate the length, which is the only direction that matters here.
 */
export function showSeconds(seconds: number): string {
  return (Math.ceil(seconds * 100) / 100).toFixed(2)
}

/**
 * Everything before the expensive call: synthesise, MEASURE, price, gate, host.
 *
 * The refusals are ordered by what they cost. Everything above the TTS call is
 * free; the ceiling refusal costs about one credit and saves two hundred, which
 * is the trade this whole module exists to make.
 */
export async function prepareFaceSpeak(
  d: KieDeps,
  opts: {
    text: string
    store: Store
    maxSeconds?: number
    voiceName?: string
    style?: string
    pace?: string
    /** Skips the balance floor when the account balance cannot be read. */
    creditFloor?: number
  }
): Promise<Prepared | PrepareRefused> {
  const log = d.log || (() => {})
  if (!d.key)
    return {
      ok: false,
      stage: 'no-key',
      spentCredits: 0,
      reason:
        'провайдер говорящего лица не настроен в сервисе (нет KIE_AI_API_KEY) — ничего не списано',
    }

  const ceiling = Math.min(
    Math.max(1, Math.round(opts.maxSeconds || DEFAULT_MAX_SECONDS)),
    HARD_MAX_SECONDS
  )
  const text = String(opts.text || '').trim()
  if (!text)
    return {
      ok: false,
      stage: 'text-too-long',
      spentCredits: 0,
      reason: 'нечего произносить: текст пустой',
    }

  const charCap = ceiling * MAX_CHARS_PER_SECOND
  if (text.length > charCap)
    return {
      ok: false,
      stage: 'text-too-long',
      spentCredits: 0,
      reason:
        `${text.length} символов заведомо длиннее ${ceiling} с речи ` +
        `(предел ${charCap}). Сократи текст — озвучка ещё не запускалась, ` +
        'потрачено 0 кредитов',
    }

  const voice = await speak(d, {
    text,
    voiceName: opts.voiceName,
    style: opts.style,
    pace: opts.pace,
  })
  const spentCredits = voice.credits ?? 0
  if (!voice.ok || !voice.url)
    return {
      ok: false,
      stage: 'tts-failed',
      spentCredits,
      reason: `озвучка не получилась (${voice.stage}): ${voice.message}`,
    }

  const got = await d.fetchImpl(voice.url)
  if (!got.ok)
    return {
      ok: false,
      stage: 'audio-unreadable',
      spentCredits,
      reason: `озвучка готова, но не скачалась: HTTP ${got.status}`,
    }
  const bytes = new Uint8Array(await got.arrayBuffer())
  const seconds = readWavSeconds(bytes)
  if (seconds == null || !(seconds > 0))
    return {
      ok: false,
      stage: 'audio-unreadable',
      spentCredits,
      reason:
        'длительность озвучки не читается из файла — цена неизвестна, ' +
        'поэтому дорогой вызов не делается',
    }

  const wouldCost = priceOfSeconds(seconds)

  /**
   * THE GATE. Everything above it is preparation; this is the line the money is
   * on. Nothing below runs when it fires, and the numbers are quoted rather
   * than summarised: a refusal that says "too long" teaches the caller nothing
   * about how much to cut.
   */
  if (seconds > ceiling) {
    const overBy = seconds - ceiling
    const cutChars = Math.ceil(overBy * (text.length / seconds))
    log(`лицо: отказ по потолку ${showSeconds(seconds)} с > ${ceiling} с`)
    return {
      ok: false,
      stage: 'over-ceiling',
      seconds,
      wouldCost,
      spentCredits,
      reason:
        `речь вышла ${showSeconds(seconds)} с при потолке ${ceiling} с. ` +
        `Лицо стоило бы ${wouldCost} кредитов — не запускал. ` +
        `Убери примерно ${cutChars} символов из ${text.length} ` +
        `(потрачено ${spentCredits} кредитов на озвучку)`,
    }
  }

  /**
   * THE FLOOR UNDER THE BALANCE. `image_edit` is a shipped tool a person pays
   * for and shares this purse; a talking head is not allowed to eat the last of
   * it. An unreadable balance is not a licence to spend: it refuses.
   */
  const floor = opts.creditFloor ?? CREDIT_FLOOR
  const balance = await kieCredits(d)
  if (balance == null)
    return {
      ok: false,
      stage: 'low-balance',
      seconds,
      wouldCost,
      spentCredits,
      reason:
        'баланс провайдера не читается — не трачу вслепую. Озвучка уже готова, ' +
        'повтори позже',
    }
  if (balance - wouldCost < floor)
    return {
      ok: false,
      stage: 'low-balance',
      seconds,
      wouldCost,
      spentCredits,
      reason:
        `на счету ${balance} кредитов, ролик стоит ${wouldCost}, ` +
        `а ${floor} зарезервировано под перерисовку фото. Не запускал`,
    }

  let audioUrl = ''
  try {
    // The extension is load-bearing: the provider judges the file by the URL.
    audioUrl = await opts.store(
      bytes,
      `face-speak-${Date.now()}.wav`,
      'audio/wav'
    )
  } catch (e) {
    return {
      ok: false,
      stage: 'store-failed',
      seconds,
      wouldCost,
      spentCredits,
      reason: `озвучка не сохранилась в наше хранилище: ${String((e as Error)?.message || e).slice(0, 200)}`,
    }
  }

  return {
    ok: true,
    audioUrl,
    seconds,
    plannedCredits: wouldCost,
    spentCredits,
    ceilingSeconds: ceiling,
  }
}

/**
 * Submit the face job. Returns the id the caller MUST write down before it
 * waits for anything: at 26 credits a second a lost id is a lost clip that was
 * paid for, and the next call buys another one.
 */
export async function startFace(
  d: KieDeps,
  o: { imageUrl: string; audioUrl: string }
): Promise<{ taskId?: string; refusal?: string }> {
  // image_url and audio_url are the complete required set, measured — see the
  // probe table in the file header.
  return createTask(d, FACE_MODEL, {
    image_url: o.imageUrl,
    audio_url: o.audioUrl,
  })
}

/**
 * Did the bill match the plan?
 *
 * CREDITS_PER_SECOND is the owner's measurement, not a published price, and the
 * ceiling arithmetic is built entirely on it. If omnihuman ever prices by
 * output resolution the way veed/fabric-1 does, every number this module quotes
 * becomes wrong while every test stays green. So each real job compares what it
 * was billed against what it planned and says so out loud.
 */
export function priceDrift(
  seconds: number,
  actualCredits: number | null
): string | undefined {
  if (actualCredits == null || actualCredits <= 0 || seconds <= 0) return
  const perSecond = actualCredits / seconds
  const off = Math.abs(perSecond - CREDITS_PER_SECOND) / CREDITS_PER_SECOND
  if (off < 0.2) return
  return (
    `цена разошлась с расчётом: ${perSecond.toFixed(1)} кредитов за секунду ` +
    `вместо ${CREDITS_PER_SECOND}. Потолок посчитан по старой цифре`
  )
}
