/**
 * THE VOICE-OVER-FIRST REEL CHAIN: everything in src/reel-plan.ts that has to
 * touch a network, a process or the disk.
 *
 * WHAT RUNS, IN THE ORDER MONEY CAN BE LOST:
 *
 *   0. the face budget, in SECONDS OF FACE, before a single provider is told
 *      anything -- checkFaceBudget in reel-plan.ts;
 *   1. one voice-over for the whole script, from Kie TTS (1.37 credits for
 *      9.72 s, measured);
 *   2. the voice-over goes into OUR S3 before any provider sees it;
 *   3. for each face cut: ffmpeg slices that window out of the ONE voice-over,
 *      the slice goes to our S3, and the slice plus the portrait go to the face
 *      provider;
 *   4. the stills, from img2img on the caller's own picture;
 *   5. assembly, with the single voice-over laid underneath the whole thing;
 *   6. the charge, AFTER every provider has answered.
 *
 * WHY THE AUDIO GOES TO OUR S3 FIRST, and it is two reasons, not one. A
 * Telegram file URL carries the bot token in its path -- handing it to a
 * provider publishes a credential. And veed/fabric-1 decides whether a file is
 * audio by READING THE URL'S EXTENSION, not the bytes: measured today, a 404
 * URL ending `.mp3` passes validation and a real WAV behind an extensionless
 * CDN path is refused with "file type not supported", an error that points at
 * the file when the fault is in the URL. Our /upload keeps the filename, so the
 * extension survives.
 *
 * WHY THE CHARGE IS LAST. src/agent/tools.ts image_edit already moved the key
 * check ahead of the charge, after tokens vanished into a locked FAL account.
 * This goes one step further: nothing is taken until every provider has
 * ANSWERED, so there is no refund path to trust. A refund is a promise; not
 * charging is a fact.
 *
 * WHAT IS MEASURED AND WHAT IS DEAD, 2026-08-31, on this account:
 *
 *   google/gemini-3-1-flash-tts   WORKS. 1.37 credits for 9.72 s of speech.
 *   google/nano-banana-edit       WORKS. 4 credits per still, keeps the face.
 *   veed/fabric-1                 DEAD. createTask answers code 200 "success"
 *                                 with a taskId, and recordInfo answers
 *                                 state:fail, failCode 500, "internal error,
 *                                 please try again later", costTime exactly 30,
 *                                 creditsConsumed 0. Nine attempts today across
 *                                 every variable that can be varied: 480p and
 *                                 720p, four different host origins including
 *                                 our own S3, WAV and MP3, a 0.3 s tone and 2 s
 *                                 of real speech, the owner's shadowed avatar
 *                                 and a purpose-made frontal evenly-lit
 *                                 mouth-closed portrait. All nine identical.
 *   wan/2-5-*                     NOT PROVISIONED, and this is the free
 *                                 diagnosis that explains fabric-1. Send a
 *                                 duration the enum accepts and the gateway
 *                                 answers "Operation not found:
 *                                 Market_wan_2-5-image-to-video_5" -- the model
 *                                 id validates, the parameters validate, and
 *                                 there is no operation behind them. Every
 *                                 other duration answers "duration is not
 *                                 within the range of allowed options", so the
 *                                 enum {5,10} and the absence are two separate
 *                                 findings from one free probe.
 *   Replicate SadTalker           WORKS. 2.04 s of video from our portrait and
 *                                 our audio slice, 40.9 s of predict time.
 *
 * SO THE FACE PROVIDER IS AN INTERFACE, NOT A CONSTANT. The owner's chosen
 * model is tried first and is expected to come back; the chain must not be
 * unable to run in the meantime, and it must never SILENTLY substitute -- the
 * answer names which provider drew the face and what every refusal said.
 *
 * THE FAILURE SHAPE TO REMEMBER: createTask returning 200 "success" for a job
 * that will fail means any health check that stops at createTask reports this
 * chain GREEN while it is dead. That is the same class as the FAL 403 that hid
 * the image layer's death for weeks. Only recordInfo tells the truth, and only
 * `creditsConsumed` on it tells the truth about money -- the account balance
 * moves under concurrent work, so a before/after delta charges other people's
 * spend to this job.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  assembleArgs,
  checkFaceBudget,
  defaultFaceCuts,
  planReel,
  sliceArgs,
  type FaceCut,
  type Log,
  type ReelPlan,
} from './reel-plan'

export const KIE_BASE = 'https://api.kie.ai/api/v1'
export const TTS_MODEL = 'google/gemini-3-1-flash-tts'
export const FABRIC_MODEL = 'veed/fabric-1'
/** Pinned: an unpinned Replicate model changes its contract without notice. */
export const SADTALKER_VERSION =
  '85c698db7c0a66d5011435d0191db323034e1da04b912a6d365833141b6a285b'

export type Fetch = typeof fetch

/** Runs ffmpeg/ffprobe. Injected so a test never spawns a process. */
export type Exec = (
  bin: string,
  args: string[]
) => Promise<{ code: number; stdout: string; stderr: string }>

/* --------------------------------------------------------------- kie jobs */

/**
 * Why this does not call kie-image.ts's runKieJob: that function answers
 * `{ok, url, credits}` where `credits` is a BALANCE DELTA and a refusal and a
 * provider failure are the same value. Both are wrong for this chain. The
 * balance moves under concurrent work on this account -- observed today, it
 * changed while this process created no task at all -- and the whole finding
 * above depends on telling "Kie would not take my request" apart from "Kie took
 * it and could not do it". Those are different worlds: the first is our bug and
 * the second is free to retry.
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
  /** recordInfo.creditsConsumed, the only per-task cost that is not a guess. */
  credits: number | null
  message: string
}

async function kieCall(
  base: string,
  key: string,
  route: string,
  init: RequestInit,
  ms: number,
  f: Fetch
): Promise<{ status: number; json: any; text: string }> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await f(`${base}${route}`, {
      ...init,
      signal: c.signal,
      headers: {
        Authorization: `Bearer ${key}`,
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

export interface KieDeps {
  fetchImpl: Fetch
  key: string
  base?: string
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  timeoutMs?: number
}

export async function runKieJob(
  d: KieDeps,
  model: string,
  input: Record<string, unknown>
): Promise<JobAnswer> {
  const base = d.base || KIE_BASE
  const sleep = d.sleep || ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const pollMs = d.pollMs ?? 5_000
  const timeoutMs = d.timeoutMs ?? 300_000

  const created = await kieCall(
    base,
    d.key,
    '/jobs/createTask',
    { method: 'POST', body: JSON.stringify({ model, input }) },
    30_000,
    d.fetchImpl
  )
  const taskId = created.json?.data?.taskId || created.json?.data?.task_id
  if (!taskId)
    return {
      ok: false,
      stage: 'input-refused',
      credits: 0,
      message: String(
        created.json?.msg || created.json?.message || created.text
      ).slice(0, 300),
    }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await sleep(pollMs)
    // recordInfo, never taskStatus: taskStatus answers HTTP 404 on this account.
    const st = await kieCall(
      base,
      d.key,
      `/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { method: 'GET' },
      30_000,
      d.fetchImpl
    )
    const data = st.json?.data
    const state = String(data?.state || '')
    const consumed =
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
          credits: consumed,
          message: 'Kie сказал success без файла',
        }
      return {
        ok: true,
        stage: 'success',
        url: String(urls[0]),
        taskId,
        credits: consumed,
        message: 'ok',
      }
    }
    if (state === 'fail' || state === 'failed')
      return {
        ok: false,
        stage: 'provider-failed',
        taskId,
        // Measured 9/9 today: a provider-side failure is billed 0, so this is
        // read from the answer rather than assumed to be the planned price.
        credits: consumed,
        message: String(data?.failMsg || 'без причины').slice(0, 300),
      }
  }
  return {
    ok: false,
    stage: 'timeout',
    taskId,
    // A timeout is NOT a refund: the task may still finish and be billed.
    credits: null,
    message: `Kie не ответил за ${Math.round(timeoutMs / 1000)} с, задача ${taskId}`,
  }
}

/* ------------------------------------------------------------------- voice */

/**
 * ONE VOICE-OVER FOR THE WHOLE SCRIPT.
 *
 * The contract was found by probing refusals, free, because the docs are wrong
 * about it (docs.kie.ai marks `accent` required per speaker; validation walks
 * past its absence all the way to the turn cross-reference). What is actually
 * enforced, each rule from the refusal that named it:
 *
 *   speakers[] and dialogue_turns[] are both required and both non-empty;
 *   speakers[].speaker_id must match "Speaker N" with N starting at 1 --
 *     "Speaker 0", "Speaker1" and "Alice" are all refused by name;
 *   dialogue_turns[].speaker_id must reference a declared speaker;
 *   voice_name is CASE-SENSITIVE ("Zephyr" yes, "zephyr" no);
 *   accent / style / pace are optional but enum-validated when present;
 *   temperature is range-checked.
 *
 * Errors arrive as HTTP 200 with code 422 in the body -- veed/fabric-1 uses
 * code 500 for the same class, so never key a classifier on one of them.
 *
 * The output is a .wav, and .wav is already on veed/fabric-1's accepted
 * extension list, so this leg needs no re-hosting hop for the extension's sake.
 * It gets one anyway, for the token reason at the top of the file.
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

/* ---------------------------------------------------------- face providers */

export interface FaceAnswer {
  ok: boolean
  url?: string
  /** Kie credits where the provider bills in them, null where it does not. */
  credits: number | null
  message: string
  /** True when the fault is the provider's, so a retry is free and sensible. */
  providerFault: boolean
}

export interface FaceProvider {
  id: string
  /** Kie credits per second of face; drives the ceiling arithmetic. */
  creditsPerSecond: number
  animate(o: {
    imageUrl: string
    audioUrl: string
    seconds: number
  }): Promise<FaceAnswer>
}

/**
 * The owner's chosen model. MEASURED DEAD TODAY (see the file header) and kept
 * first in the list anyway, because a failed generation is billed 0, so trying
 * it costs nothing and is how we will notice the day it comes back.
 *
 * `resolution` IS REQUIRED. Omit it and createTask answers code 500
 * "resolution is required" and NO TASK IS CREATED -- reproduced on roughly 40
 * separate calls. src/talking-portrait.ts:484 sends exactly two keys under a
 * comment claiming they are all the model asks for, so every call on that path
 * is refused before it reaches the outage; the word "resolution" appears
 * nowhere in that file or its test.
 */
export function kieFabricFace(d: KieDeps, resolution = '720p'): FaceProvider {
  return {
    id: FABRIC_MODEL,
    creditsPerSecond: 18,
    async animate(o) {
      const r = await runKieJob(d, FABRIC_MODEL, {
        image_url: o.imageUrl,
        audio_url: o.audioUrl,
        resolution,
      })
      return {
        ok: r.ok,
        url: r.url,
        credits: r.credits,
        message: `${r.stage}: ${r.message}`,
        providerFault: r.stage === 'provider-failed' || r.stage === 'timeout',
      }
    },
  }
}

export interface ReplicateDeps {
  fetchImpl: Fetch
  token: string
  base?: string
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  timeoutMs?: number
}

/**
 * The provider that answered while Kie's did not.
 *
 * SadTalker takes a still and an audio file and returns a talking head, which
 * is exactly this chain's face leg. It bills in dollars rather than Kie
 * credits, so `credits` is null here and the seconds-of-face ceiling is still
 * enforced -- the ceiling is about how much FACE a reel may contain, and that
 * argument does not change with the price list.
 *
 * `still: true` is deliberate. The head is composited into a reel next to
 * engravings; SadTalker's default free head motion fights the cut and makes the
 * background of a photographic portrait breathe, which is failure mode 3 of the
 * talking-head literature (background deformation) and the cheapest one to see.
 */
export function replicateSadTalkerFace(d: ReplicateDeps): FaceProvider {
  const base = d.base || 'https://api.replicate.com/v1'
  const sleep = d.sleep || ((ms: number) => new Promise(r => setTimeout(r, ms)))
  return {
    id: `replicate:sadtalker@${SADTALKER_VERSION.slice(0, 8)}`,
    creditsPerSecond: 0,
    async animate(o) {
      const headers = {
        Authorization: `Bearer ${d.token}`,
        'Content-Type': 'application/json',
      }
      const r = await d.fetchImpl(`${base}/predictions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          version: SADTALKER_VERSION,
          input: {
            source_image: o.imageUrl,
            driven_audio: o.audioUrl,
            preprocess: 'full',
            still: true,
            enhancer: 'gfpgan',
          },
        }),
      })
      let job: any = await r.json().catch(() => null)
      if (!job?.id)
        return {
          ok: false,
          credits: null,
          message: `replicate не принял заявку: ${String(job?.detail || r.status)}`,
          providerFault: false,
        }
      const deadline = Date.now() + (d.timeoutMs ?? 600_000)
      while (
        (job.status === 'starting' || job.status === 'processing') &&
        Date.now() < deadline
      ) {
        await sleep(d.pollMs ?? 6_000)
        job = await (
          await d.fetchImpl(`${base}/predictions/${job.id}`, { headers })
        )
          .json()
          .catch(() => job)
      }
      const url = typeof job?.output === 'string' ? job.output : ''
      if (job?.status !== 'succeeded' || !url)
        return {
          ok: false,
          credits: null,
          message: `replicate ${job?.status}: ${String(job?.error || '').slice(0, 200)}`,
          providerFault: true,
        }
      return {
        ok: true,
        url,
        credits: null,
        message: 'ok',
        providerFault: false,
      }
    },
  }
}

/**
 * Try each provider in order and NAME the one that answered.
 *
 * A silent substitution is worse than a refusal: the reel would come back with
 * a face nobody chose and a bill nobody predicted. Every refusal is carried
 * forward in `attempts` so the answer says what each provider said.
 */
export async function animateWithFallback(
  providers: FaceProvider[],
  o: { imageUrl: string; audioUrl: string; seconds: number },
  log: Log
): Promise<FaceAnswer & { providerId?: string; attempts: string[] }> {
  const attempts: string[] = []
  for (const p of providers) {
    const r = await p.animate(o)
    attempts.push(`${p.id}: ${r.ok ? 'ok' : r.message}`)
    if (!r.ok) {
      log(`лицо: ${p.id} отказал — ${r.message}`)
      continue
    }
    return { ...r, providerId: p.id, attempts }
  }
  return {
    ok: false,
    credits: 0,
    message: attempts.join(' | ') || 'ни один провайдер лица не задан',
    providerFault: true,
    attempts,
  }
}

/* ------------------------------------------------------------------- store */

/** Bytes in OUR S3, and the filename -- hence the extension -- is preserved. */
export type Store = (
  bytes: Uint8Array,
  filename: string,
  contentType: string
) => Promise<string>

export function s3Store(opts: {
  baseUrl: string
  apiKey: string
  fetchImpl: Fetch
}): Store {
  return async (bytes, filename, contentType) => {
    const r = await opts.fetchImpl(`${opts.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-Filename': filename,
        'X-Api-Key': opts.apiKey,
      },
      /**
       * `bytes as BodyInit` and not `bytes` alone.
       *
       * A Uint8Array is a perfectly good fetch body at RUNTIME, and every other
       * upload in this package passes one. TypeScript's DOM lib, however, types
       * BodyInit without it under this configuration, so the call failed to
       * compile and pushed the package one error above its baseline of seven --
       * the exact ratchet the merge gate watches.
       */
      body: bytes as unknown as BodyInit,
    })
    const data: any = await r.json().catch(() => null)
    const url = data?.directUrl
    if (typeof url !== 'string' || !url)
      throw new Error(`S3 не принял ${filename}: HTTP ${r.status}`)
    return url
  }
}

/* --------------------------------------------------------------- the chain */

export interface ReelSpec {
  /** The whole script. One synthesis, one file, one continuous voice. */
  script: string
  /** The caller's own portrait: what speaks, and what the stills are drawn from. */
  portraitUrl: string
  /** One img2img prompt per still. Their order is the order on screen. */
  stillPrompts: string[]
  /** Explicit windows of the voice-over the face speaks. Default: hook + close. */
  faceCuts?: FaceCut[]
  hookMs?: number
  closeMs?: number
  ceilingSeconds?: number
  voiceName?: string
  style?: string
  pace?: string
}

export interface ReelDeps {
  kie: KieDeps
  faceProviders: FaceProvider[]
  store: Store
  exec: Exec
  fetchImpl: Fetch
  workDir: string
  log: Log
  /** img2img. Injected because the still leg is already shipped elsewhere. */
  editImage: (o: {
    prompt: string
    imageUrl: string
  }) => Promise<{
    ok: boolean
    url?: string
    credits?: number | null
    reason?: string
  }>
  /**
   * Called ONLY after every provider has answered. Returning ok:false throws
   * the reel away rather than delivering something unpaid.
   */
  charge?: (o: {
    faceSeconds: number
    faceCredits: number
  }) => Promise<{ ok: boolean; reason?: string }>
  now?: () => number
}

export interface ReelOutcome {
  ok: boolean
  reason?: string
  file?: string
  plan?: ReelPlan
  voiceUrl?: string
  voiceMs?: number
  faceProviderId?: string
  faceAttempts?: string[]
  /** Kie credits actually consumed, summed from recordInfo, never a delta. */
  kieCredits: number
  charged?: boolean
}

async function download(f: Fetch, url: string, file: string): Promise<number> {
  const r = await f(url)
  if (!r.ok) throw new Error(`не скачалось (${r.status}): ${url.slice(0, 80)}`)
  const bytes = Buffer.from(await r.arrayBuffer())
  if (!bytes.length) throw new Error(`пустой файл: ${url.slice(0, 80)}`)
  fs.writeFileSync(file, bytes)
  return bytes.length
}

/** Milliseconds of an audio or video file, from ffprobe. */
export async function probeMs(exec: Exec, file: string): Promise<number> {
  const r = await exec('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1:nk=1',
    file,
  ])
  const v = Number(String(r.stdout).trim())
  return Number.isFinite(v) ? Math.round(v * 1000) : 0
}

export async function produceReel(
  spec: ReelSpec,
  d: ReelDeps
): Promise<ReelOutcome> {
  const now = d.now || (() => Date.now())
  const stamp = now()
  let kieCredits = 0
  const add = (c: number | null) => {
    if (typeof c === 'number')
      kieCredits = Math.round((kieCredits + c) * 100) / 100
  }
  fs.mkdirSync(d.workDir, { recursive: true })

  // 0. THE CEILING, BEFORE ANYTHING IS SPENT. When the caller named the cuts,
  // the face seconds are known from the request alone and the price can be
  // refused here -- before even the cheap TTS call.
  const rate = d.faceProviders[0]?.creditsPerSecond ?? 18
  if (spec.faceCuts?.length) {
    const gate = checkFaceBudget({
      faceCuts: spec.faceCuts,
      ceilingSeconds: spec.ceilingSeconds,
      creditsPerFaceSecond: rate,
    })
    if (!gate.ok) {
      d.log(`план: ${gate.reason}`)
      return { ok: false, reason: gate.reason, kieCredits: 0 }
    }
    d.log(
      `план: ${gate.faceSeconds} с лица = ${gate.faceCredits} кредитов по ${rate}/с — в пределах потолка`
    )
  }

  // 1. ONE voice-over for the whole script.
  const voice = await speak(d.kie, {
    text: spec.script,
    voiceName: spec.voiceName,
    style: spec.style,
    pace: spec.pace,
  })
  add(voice.credits)
  if (!voice.ok || !voice.url)
    return {
      ok: false,
      reason: `озвучка не получилась (${voice.stage}): ${voice.message}`,
      kieCredits,
    }

  const voiceFile = path.join(d.workDir, `voice-${stamp}.wav`)
  await download(d.fetchImpl, voice.url, voiceFile)
  const voiceMs = await probeMs(d.exec, voiceFile)

  // 2. OUR S3 before any provider sees it. A Telegram file URL carries the bot
  // token, and veed/fabric-1 judges the file by the URL's extension.
  const voiceUrl = await d.store(
    new Uint8Array(fs.readFileSync(voiceFile)),
    `reel-voice-${stamp}.wav`,
    'audio/wav'
  )

  // 3. THE PLAN, now that the real length is known.
  const cuts = spec.faceCuts?.length
    ? spec.faceCuts
    : defaultFaceCuts({
        voiceMs,
        hookMs: spec.hookMs,
        closeMs: spec.closeMs,
      })
  const plan = planReel({
    voiceMs,
    faceCuts: cuts,
    stillCount: spec.stillPrompts.length,
    ceilingSeconds: spec.ceilingSeconds,
    creditsPerFaceSecond: rate,
  })
  for (const n of plan.notes) d.log(`план: ${n}`)
  if (plan.refusals.length)
    return {
      ok: false,
      reason: plan.refusals.join('; '),
      plan,
      voiceUrl,
      voiceMs,
      kieCredits,
    }
  d.log(
    `план: озвучка ${voiceMs} мс, лица ${plan.faceSeconds} с (${plan.faceCredits} кредитов, ` +
      `потолок ${plan.ceilingSeconds} с), кусков ${plan.timeline.length}`
  )

  // 4. The face cuts: slice the ONE voice-over, store the slice, animate it.
  const faceFiles: string[] = []
  let faceProviderId: string | undefined
  let faceAttempts: string[] = []
  for (let i = 0; i < plan.faceCuts.length; i++) {
    const cut = plan.faceCuts[i]
    const sliceFile = path.join(d.workDir, `slice-${stamp}-${i}.wav`)
    const cutRun = await d.exec(
      'ffmpeg',
      sliceArgs({ voiceFile, cut, outFile: sliceFile })
    )
    if (cutRun.code !== 0)
      return {
        ok: false,
        reason: `не вырезал кусок голоса №${i + 1}: ${cutRun.stderr.slice(0, 200)}`,
        plan,
        voiceUrl,
        voiceMs,
        kieCredits,
      }
    const sliceUrl = await d.store(
      new Uint8Array(fs.readFileSync(sliceFile)),
      `reel-slice-${stamp}-${i}.wav`,
      'audio/wav'
    )
    const face = await animateWithFallback(
      d.faceProviders,
      {
        imageUrl: spec.portraitUrl,
        audioUrl: sliceUrl,
        seconds: cut.durationMs / 1000,
      },
      d.log
    )
    add(face.credits)
    faceAttempts = faceAttempts.concat(face.attempts)
    if (!face.ok || !face.url)
      return {
        ok: false,
        reason: `лицо №${i + 1} не сгенерировано: ${face.message}`,
        plan,
        voiceUrl,
        voiceMs,
        faceAttempts,
        kieCredits,
      }
    faceProviderId = face.providerId
    const faceFile = path.join(d.workDir, `face-${stamp}-${i}.mp4`)
    await download(d.fetchImpl, face.url, faceFile)
    faceFiles.push(faceFile)
  }

  // 5. The stills.
  const stillFiles: string[] = []
  for (let i = 0; i < spec.stillPrompts.length; i++) {
    const still = await d.editImage({
      prompt: spec.stillPrompts[i],
      imageUrl: spec.portraitUrl,
    })
    add(still.credits ?? null)
    if (!still.ok || !still.url)
      return {
        ok: false,
        reason: `гравюра №${i + 1} не нарисовалась: ${still.reason || 'без причины'}`,
        plan,
        voiceUrl,
        voiceMs,
        faceProviderId,
        faceAttempts,
        kieCredits,
      }
    const f = path.join(d.workDir, `still-${stamp}-${i}.png`)
    await download(d.fetchImpl, still.url, f)
    stillFiles.push(f)
  }

  // 6. Assembly. The single voice-over is the reel's only audio track.
  const outFile = path.join(d.workDir, `reel-${stamp}.mp4`)
  const { args } = assembleArgs(plan, {
    faceFiles,
    stillFiles,
    voiceFile,
    outFile,
  })
  const built = await d.exec('ffmpeg', args)
  if (built.code !== 0 || !fs.existsSync(outFile))
    return {
      ok: false,
      reason: `сборка не удалась: ${built.stderr.slice(0, 300)}`,
      plan,
      voiceUrl,
      voiceMs,
      faceProviderId,
      faceAttempts,
      kieCredits,
    }

  // 7. THE CHARGE, after every provider has answered. Nothing above this line
  // took anything from the person, so there is no refund to trust.
  let charged: boolean | undefined
  if (d.charge) {
    const c = await d.charge({
      faceSeconds: plan.faceSeconds,
      faceCredits: plan.faceCredits,
    })
    charged = c.ok
    if (!c.ok)
      return {
        ok: false,
        reason: `ролик собран, но списать не вышло: ${c.reason || 'без причины'}`,
        plan,
        voiceUrl,
        voiceMs,
        faceProviderId,
        faceAttempts,
        kieCredits,
        charged,
      }
  }

  return {
    ok: true,
    file: outFile,
    plan,
    voiceUrl,
    voiceMs,
    faceProviderId,
    faceAttempts,
    kieCredits,
    charged,
  }
}
