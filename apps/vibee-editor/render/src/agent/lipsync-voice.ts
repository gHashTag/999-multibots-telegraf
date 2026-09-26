/**
 * A VOICE FOR A TALKING FACE, CUT TO WHAT THE LIPSYNC ROUTE TAKES.
 *
 * WHY THIS EXISTS (owner, 2026-09-24). The owner asked the agent for a reel
 * that opens on a photo of the owner's face and then speaks in the owner's own
 * voice, taken from one of the owner's reels. The agent had no way to do it: none of its tools does
 * photo + voice -> talking face, so it assembled a template from old clips and
 * described a lipsync it had not made. The render DID have the capability --
 * `POST /api/generate/lipsync`, the Mini App's route (KIE InfiniteTalk, fal as
 * fallback) -- only no agent tool reached it. `lipsync_generate` in tools.ts
 * is that tool; this module is the part of it that touches files.
 *
 * THREE THINGS THE ROUTE DOES NOT DO, AND THIS DOES:
 *
 *   the voice may arrive as a VIDEO -- the owner's reel -- and the route wants
 *   a sound file, so the soundtrack is pulled out here;
 *
 *   a few seconds of silence may lead the track, so the reel opens on the still
 *   face and only then speaks (the owner's "start with my photo");
 *
 *   the route refuses anything longer than its ceiling for the model named
 *   (`lipsyncMaxSecondsFor` below, which the route itself calls). A voice
 *   longer than that is cut into equal parts under it, each part is
 *   lip-synced on its own, and the parts are joined -- with a visible restart
 *   at every seam, which is why a model measured on longer audio gets a
 *   ceiling that takes the whole reel in one pass.
 *
 * The functions that plan are pure, so the arithmetic of money is tested
 * without ffmpeg; the functions that run ffmpeg are thin and separate.
 */
import { execFile } from 'node:child_process'
import { assetOrigins } from './asset-links'
import { shelfObject } from './media-parts'

/**
 * The route's ceiling, in seconds, for any model not listed below: ten
 * seconds, set before anybody had measured a provider on longer audio.
 */
export const LIPSYNC_ROUTE_MAX_SECONDS = 10

/**
 * THE MODELS MEASURED ON LONGER AUDIO, and the ceiling each gets.
 *
 * Ten seconds is OUR limit, not the providers'. It is why the owner's first
 * reel (2026-09-24, 21.4 s of voice) came out as three 7-second parts, each
 * restarting from the same still: "short animated photos", in the owner's
 * words. Kling AI Avatar takes up to five minutes of audio a call on KIE
 * (kie.ai/kling-ai-avatar), and the owner chose it over OmniHuman from the
 * 3-second probes that day, so a call NAMING it takes a minute: the tool's
 * whole reel (LIPSYNC_TOOL_MAX_SECONDS) in one pass, with room for the
 * route's own measurement of the file.
 *
 * Every other model keeps ten seconds until it is measured longer: a ceiling
 * raised on a guess bills the house for work that fails and is refunded. An
 * unnamed call keeps it too, since it may fall back to fal, whose limits this
 * does not speak for.
 */
const ROUTE_MAX_SECONDS_BY_MODEL: Readonly<Record<string, number>> = {
  'kie/kling/ai-avatar-standard': 60,
}

/** The longest voice one route call takes for this model name, seconds. */
export function lipsyncMaxSecondsFor(model: unknown): number {
  return (
    (typeof model === 'string' && ROUTE_MAX_SECONDS_BY_MODEL[model]) ||
    LIPSYNC_ROUTE_MAX_SECONDS
  )
}

/**
 * How far below the ceiling a planned part stays: the route measures the
 * uploaded part itself with ffprobe, and an encoded 10.000 s cut can measure
 * 10.02 s -- refused, after the charge.
 */
const PART_MARGIN_SECONDS = 0.5

/** How long one part may be when planned, for the default ceiling. */
export const LIPSYNC_PART_TARGET_SECONDS =
  LIPSYNC_ROUTE_MAX_SECONDS - PART_MARGIN_SECONDS

/** How long one part may be when planned, for this model name. */
export function partTargetSecondsFor(model: unknown): number {
  return lipsyncMaxSecondsFor(model) - PART_MARGIN_SECONDS
}

/**
 * HOW LONG A LIPSYNC JOB IS WAITED FOR -- by the route polling the provider,
 * and by the tool waiting for the route.
 *
 * Both waited five minutes flat: the route's 60 polls of 5 s, and Node's
 * fetch, which gives up on a response whose headers take longer than 300 s.
 * That was sized for 10-second parts. A provider still working at minute five
 * finishes and bills us with nobody left to take the result, and the person
 * is refunded for work we paid for. So the wait grows with the voice: five
 * minutes of queue plus 75 s for every second. Polling costs nothing; a job
 * that fails says so on the next poll and ends the wait at once.
 */
export const LIPSYNC_POLL_INTERVAL_MS = 5_000

/** Polls of the provider for a part of this many seconds. */
export function lipsyncPollAttempts(seconds: number): number {
  const s =
    Number.isFinite(seconds) && seconds > 0
      ? Math.ceil(seconds)
      : LIPSYNC_ROUTE_MAX_SECONDS
  return 60 + 15 * s
}

/** How long a caller of the route waits for a part: the polls, plus slack. */
export function lipsyncWaitMs(seconds: number): number {
  return lipsyncPollAttempts(seconds) * LIPSYNC_POLL_INTERVAL_MS + 120_000
}

/** The longest voice the tool takes: a reel's worth, three parts at most. */
export const LIPSYNC_TOOL_MAX_SECONDS = 30

/**
 * The lipsync models the route takes by name, as `kie/<id>`. MUST equal
 * KIE_LIPSYNC in render-server.ts (a test reads it): a name the route does not
 * list is quietly replaced there by its default, and the person would be
 * charged one model's price for another's work.
 *
 * Why a choice at all (2026-09-24): InfiniteTalk, the route's default, failed
 * every call of the owner's first reel with KIE's own "internal error, please
 * try again later", and its fallback, fal, is out of balance. Naming another
 * model is the only way round a provider that is down, and each model keeps
 * its own per-second price (billing-shared priceForModel).
 *
 * Veed Fabric was added the same day at the owner's price, then taken out
 * again: its first probe failed with the same "internal error" as nine
 * attempts in August (FAILS_AT_PROVIDER in kie-web-provider.ts).
 */
export const LIPSYNC_MODELS: readonly string[] = [
  'kie/infinitalk/from-audio',
  'kie/omnihuman-1-5',
  'kie/kling/ai-avatar-standard',
]

/** The largest voice file read from the shelf: the shelf's own upload limit. */
export const LIPSYNC_VOICE_MAX_BYTES = 100 * 1024 * 1024

/**
 * Wait before another try at a busy shelf, times the attempt number. The
 * shelf's upload gate answers 429 while two uploads are in flight; a
 * multi-second upload clears it within this.
 */
export const LIPSYNC_UPLOAD_RETRY_MS = 3_000

/** A pause the tests can see through (vi.useFakeTimers). */
export const sleepMs = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

/** Silence before the voice, so the reel opens on the still face. */
export const LEAD_SILENCE_MAX_SECONDS = 3

export interface VoicePart {
  /** Where the part starts in the prepared track, seconds. */
  start: number
  /** How long it is, seconds. */
  duration: number
}

/** The lead silence asked for, clamped to 0..3 s at 0.1 s. Junk is none. */
export function leadSilenceOf(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(Math.min(n, LEAD_SILENCE_MAX_SECONDS) * 10) / 10
}

/**
 * How much of the voice to use, seconds: 1..LIPSYNC_TOOL_MAX_SECONDS, and the
 * whole ceiling when not asked. A probe of a model is two or three seconds,
 * not the whole reel (owner, 2026-09-24: "it is expensive -- 21 seconds for
 * tests").
 */
export function maxSecondsOf(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return LIPSYNC_TOOL_MAX_SECONDS
  return Math.min(Math.max(n, 1), LIPSYNC_TOOL_MAX_SECONDS)
}

/**
 * Cut a track of `total` seconds into the fewest EQUAL parts no longer than
 * the target. Equal rather than "10, 10, and a 1.4-second tail": a tail that
 * short is a talking face that barely moves, billed a whole second anyway.
 */
export function splitPlan(
  total: number,
  target: number = LIPSYNC_PART_TARGET_SECONDS
): VoicePart[] {
  if (!Number.isFinite(total) || total <= 0) return []
  const count = Math.ceil(total / target)
  const duration = total / count
  return Array.from({ length: count }, (_, i) => ({
    start: i * duration,
    duration,
  }))
}

/**
 * The seconds a plan is billed for: each part rounded up, exactly the way the
 * route rounds the one duration it measures (`Math.ceil(duration)`), because
 * each part is one call of that route.
 */
export function billedSecondsOf(parts: readonly VoicePart[]): number {
  return parts.reduce((sum, p) => sum + Math.ceil(p.duration - 1e-9), 0)
}

/* ── our shelf, in either spelling ────────────────────────────────────── */

/**
 * The shelf key a URL names, or null when it is not ours.
 *
 * Two spellings reach this tool and both are ours: the render's `/s3/<key>`
 * proxy (what an attachment from Telegram becomes) and the bucket's own
 * public address (what image_edit returns). `shelfObject` knows only the
 * first, so a glammed photo straight from image_edit would have been refused
 * as "not on our shelf".
 */
export function shelfKeyOf(raw: string): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const viaProxy = shelfObject(text)
  if (viaProxy) return viaProxy.key
  const [bucket] = assetOrigins()
  if (!bucket || !text.startsWith(bucket)) return null
  let key = text.slice(bucket.length).split(/[?#]/)[0]
  try {
    key = decodeURIComponent(key)
  } catch {
    return null
  }
  if (!key || key.split('/').some(s => s === '..' || s === '.')) return null
  return key
}

/** The bucket's public address for a key: what a provider can fetch. */
export function publicShelfUrl(key: string): string {
  const [bucket] = assetOrigins()
  return bucket + key.split('/').map(encodeURIComponent).join('/')
}

/** The render's `/s3/` address for a key: what the by-key readers take. */
export function proxyShelfUrl(key: string): string {
  const base = (
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  ).replace(/\/+$/, '')
  return `${base}/s3/${key.split('/').map(encodeURIComponent).join('/')}`
}

/* ── ffmpeg ─────────────────────────────────────────────────────────────── */

const TIMEOUT_MS = 120_000

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error)
          reject(
            new Error(`${cmd} failed: ${String(stderr || error).slice(-300)}`)
          )
        else resolve(String(stdout))
      }
    )
  })
}

/** Duration of a media file, seconds; throws when there is none. */
export async function probeSeconds(path: string): Promise<number> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    path,
  ])
  const seconds = Number(out.trim())
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('no duration in the file')
  return seconds
}

/** Width and height of the first video stream. */
export async function probeSize(
  path: string
): Promise<{ width: number; height: number }> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-of',
    'csv=p=0:s=x',
    path,
  ])
  const [width, height] = out.trim().split('x').map(Number)
  if (!width || !height) throw new Error('no video stream in the file')
  return { width, height }
}

/**
 * The voice as mono 44.1 kHz WAV, from a sound file OR a video.
 *
 * Mono BEFORE the delay: `adelay` with one value delays the first channel
 * only, and a stereo track delayed on one side and downmixed afterwards is an
 * echo. WAV because every lipsync model takes it and it needs no encoder the
 * image might lack. 44.1 kHz, not the transcriber's 16 kHz: this track is the
 * sound of the finished reel.
 */
export async function voiceTrack(
  input: string,
  output: string,
  opts: { leadSilence: number; maxSeconds: number }
): Promise<void> {
  const filters = ['aformat=channel_layouts=mono']
  if (opts.leadSilence > 0)
    filters.push(`adelay=${Math.round(opts.leadSilence * 1000)}`)
  await run('ffmpeg', [
    '-nostdin',
    '-y',
    '-i',
    input,
    '-vn',
    '-af',
    filters.join(','),
    '-ac',
    '1',
    '-ar',
    '44100',
    '-t',
    String(opts.maxSeconds),
    '-c:a',
    'pcm_s16le',
    output,
  ])
}

/** One part of the prepared track, re-encoded so it starts on a clean sample. */
export async function cutPart(
  input: string,
  output: string,
  part: VoicePart
): Promise<void> {
  await run('ffmpeg', [
    '-nostdin',
    '-y',
    '-ss',
    part.start.toFixed(3),
    '-t',
    part.duration.toFixed(3),
    '-i',
    input,
    '-c:a',
    'pcm_s16le',
    output,
  ])
}

/**
 * Join the lip-synced parts into one reel. Every part is scaled to the first
 * part's frame: they come from one photo, but a provider rounding one of them
 * differently would make the concat filter refuse the whole reel.
 */
export async function joinParts(
  inputs: readonly string[],
  output: string,
  size: { width: number; height: number }
): Promise<void> {
  const w = size.width - (size.width % 2)
  const h = size.height - (size.height % 2)
  const scaled = inputs
    .map(
      (_, i) =>
        `[${i}:v]scale=${w}:${h},setsar=1,format=yuv420p[v${i}];` +
        `[${i}:a]aformat=sample_rates=44100:channel_layouts=mono[a${i}]`
    )
    .join(';')
  const pairs = inputs.map((_, i) => `[v${i}][a${i}]`).join('')
  await run('ffmpeg', [
    '-nostdin',
    '-y',
    ...inputs.flatMap(p => ['-i', p]),
    '-filter_complex',
    `${scaled};${pairs}concat=n=${inputs.length}:v=1:a=1[v][a]`,
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    output,
  ])
}
