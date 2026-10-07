/**
 * voice_clone_speak -- text spoken in a cloned voice, by OUR OWN zero-shot
 * service (deployment/voice-clone, Railway service `voice-clone`).
 *
 * Kie has no speech cloning (skill kie-only), so the owner's generated voice
 * comes from here. The service takes one audio sample and the text and
 * answers with a WAV; nothing is trained and nothing is kept on its side.
 *
 * Contract (deployment/voice-clone/server.py): POST /speak with a Bearer key
 * and {input, lang, ref_b64}; audio/wav back with X-Seconds. 503 with
 * Retry-After at once while another synthesis runs -- one at a time on CPU
 * (429 is read the same way). The model behind the door may change, so
 * nothing here assumes one.
 *
 * WHO MAY CLONE (owner, 2026-10-03): the platform owner and the keepers,
 * nobody else -- refused before any sample is fetched or the service is
 * asked. The owner's OWN voice is the owner's only: keepers clone their own
 * samples, never his (see the content check in the handler for what that
 * guard can and cannot promise).
 *
 * NOT CHARGED. The service is our own CPU box (cost ~0), like reel_analyze:
 * no provider bills us per call, so there is no TOKEN_PRICES entry and no
 * spendTokens here (nothing-free-is-charged.test.ts keeps the two in step).
 *
 * Dependencies are parameters so the whole path runs in a test without a
 * shelf, a network or the service; `LIVE_VOICE_SAMPLE` is the real loader.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTool, ToolContext } from './tools'
import { proxyShelfUrl, shelfKeyOf } from './lipsync-voice'
import { withShelfFile } from './media-extract'
import { resolveFinalUrl } from './web-guard'
import { downloadBoundedMediaToFile } from '../lib/remoteMediaDuration'
import { houseOwnTurn, ownerVoiceAllowed } from '../split-reel-plan'

/** The service refuses longer text (server.py MAX_CHARS). */
export const VOICE_CLONE_MAX_CHARS = 600
/** The service refuses a bigger sample (server.py MAX_REF_BYTES). */
export const VOICE_CLONE_SAMPLE_MAX_BYTES = 8 * 1024 * 1024
/** CPU synthesis of 600 characters takes minutes, not seconds. */
export const VOICE_CLONE_TIMEOUT_MS = 300_000
/** The private Railway address; reachable only from inside the project. */
export const VOICE_CLONE_DEFAULT_URL =
  'http://voice-clone.railway.internal:8080'

/** Shown to anyone who is neither the owner nor a keeper. */
export const VOICE_CLONE_LOCKED_REASON =
  'Клонирование голоса доступно только владельцу платформы и хранителям.' // cyrillic-ok: refusal text

/** Shown to anyone but the owner who brings the owner's sample. */
export const OWNER_VOICE_REFUSED_REASON =
  'Голос владельца -- только для самого владельца: пришлите образец своего голоса.' // cyrillic-ok: refusal text

/**
 * Shown to the owner on a turn for a client: a client's reel never speaks in
 * the owner's voice (split-reel v7, OWNER_VOICE_ON_CLIENT_REEL).
 */
export const OWNER_VOICE_NOT_FOR_CLIENT_REASON =
  "on a turn for a client the owner's voice is not spoken -- pass the client's own sample as ref_url"

/** Seconds to wait when a busy answer names no Retry-After. */
export const VOICE_CLONE_DEFAULT_RETRY_AFTER_S = 15

export interface VoiceCloneEnv {
  url: string
  key: string
  /** The owner's own voice sample; spoken for the owner alone. */
  ownerRef: string
}

export interface VoiceCloneSpeakDeps {
  env: () => VoiceCloneEnv
  /** The sample's bytes, or a reason it could not be had. Never throws. */
  sample: (
    ref: string,
    maxBytes: number
  ) => Promise<{ ok: true; bytes: Buffer } | { ok: false; why: string }>
  /** Bytes onto our shelf; '' when the upload is refused. */
  put: (bytes: Buffer, mime: string, name: string) => Promise<string>
  /** The owner or a keeper: the only people who may clone a voice at all. */
  mayClone: (who: string) => boolean
  /** The platform owner alone: the only person who may speak in his voice. */
  isOwner: (who: string) => boolean
  fetch: typeof fetch
}

/** Live environment of the render service. */
export function voiceCloneEnv(): VoiceCloneEnv {
  return {
    url: (process.env.VOICE_CLONE_URL || VOICE_CLONE_DEFAULT_URL).trim(),
    key: (process.env.VOICE_CLONE_KEY || '').trim(),
    ownerRef: (process.env.OWNER_VOICE_REF_URL || '').trim(),
  }
}

/**
 * The real sample loader. A file on our shelf is read straight out of the
 * bucket by key; anything else goes through the one guarded door for
 * model-chosen URLs (every redirect checked, the address pinned, the body
 * capped). A refusal says only that it was refused.
 */
export async function LIVE_VOICE_SAMPLE(
  ref: string,
  maxBytes: number
): Promise<{ ok: true; bytes: Buffer } | { ok: false; why: string }> {
  const key = shelfKeyOf(ref)
  if (key) {
    try {
      const got = await withShelfFile(proxyShelfUrl(key), maxBytes, path =>
        readFile(path)
      )
      if (got === 'missing')
        return { ok: false, why: 'sample not on the shelf' }
      if (got === 'too-big')
        return { ok: false, why: `sample is bigger than ${maxBytes} bytes` }
      return { ok: true, bytes: got }
    } catch {
      return { ok: false, why: 'could not read the sample from the shelf' }
    }
  }
  const target = await resolveFinalUrl(ref)
  if (!target.ok) return { ok: false, why: target.reason }
  const dir = await mkdtemp(join(tmpdir(), 'voice-ref-'))
  try {
    const file = join(dir, 'ref')
    await downloadBoundedMediaToFile(target.url, file, {
      maxBytes,
      timeoutMs: 60_000,
    })
    return { ok: true, bytes: await readFile(file) }
  } catch {
    return {
      ok: false,
      why: 'could not download the sample (or it is over 8 MB)',
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

const LANG_SHAPE = /^[a-z]{2,3}$/

/**
 * Two spellings of one shelf object (proxy or bucket address) are one
 * sample. A cheap first pass only: it knows the spellings shelfKeyOf knows,
 * and the content check in the handler catches the rest.
 */
function sameRef(a: string, b: string): boolean {
  if (a === b) return true
  const ka = shelfKeyOf(a)
  return !!ka && ka === shelfKeyOf(b)
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** A Retry-After header in seconds (delta form only), or the default. */
function retryAfterSeconds(header: string | null): number {
  const n = Number(String(header ?? '').trim())
  return Number.isFinite(n) && n > 0
    ? Math.min(n, 300)
    : VOICE_CLONE_DEFAULT_RETRY_AFTER_S
}

export function makeVoiceCloneSpeakTool(deps: VoiceCloneSpeakDeps): AgentTool {
  /*
   * The owner sample's sha256, fetched once per OWNER_VOICE_REF_URL and kept
   * in memory. Only a success is kept: a failed fetch is tried again on the
   * next call rather than remembered as "no owner sample".
   */
  const ownerHashes = new Map<string, string>()
  async function ownerSampleHash(ownerRef: string): Promise<string | null> {
    const known = ownerHashes.get(ownerRef)
    if (known) return known
    const got = await deps.sample(ownerRef, VOICE_CLONE_SAMPLE_MAX_BYTES)
    if (!got.ok || !got.bytes.length) return null
    const hash = sha256(got.bytes)
    ownerHashes.set(ownerRef, hash)
    return hash
  }

  return {
    name: 'voice_clone_speak',
    description:
      'Speak text in a cloned voice: our own zero-shot voice-clone service, ' +
      'free (no tokens). Only the platform owner and keepers may use it. ' +
      'Give the text (up to 600 characters) and ref_url -- an audio sample ' +
      'of the voice (a few seconds of clean speech; a file on our shelf or a ' +
      "public link, up to 8 MB). Without ref_url it speaks in the owner's " +
      'own voice, for the owner alone; nobody else may pass his sample. ' +
      'Returns {url, seconds}: a WAV on our shelf, usable as voice_url in ' +
      'lipsync_generate. One synthesis at a time and slow (CPU, up to a few ' +
      'minutes); when busy, say so and try again later.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'What to say, 1..600 characters.',
        },
        ref_url: {
          type: 'string',
          description: 'Audio sample of the voice to clone.',
        },
        lang: {
          type: 'string',
          description: "Language code of the text, default 'ru'.",
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    handler: async (args: any, ctx: ToolContext) => {
      // The lock comes first: for anyone who is neither the owner nor a
      // keeper nothing is fetched and the service is never asked.
      const who = String(ctx?.telegramId ?? '').trim()
      if (!who || !deps.mayClone(who))
        return { done: false, reason: VOICE_CLONE_LOCKED_REASON }
      const owner = deps.isOwner(who)
      /*
       * The owner's voice is his own reel's alone (split-reel v7): on a turn
       * for a client or a sweep for leads, even he speaks no sample of his.
       */
      const ownerVoice =
        owner &&
        ownerVoiceAllowed(
          houseOwnTurn(
            { house: true, faceOf: ctx?.faceOf, sellerSweep: ctx?.sellerSweep },
            ''
          )
        )
      const ownerRefused = owner
        ? OWNER_VOICE_NOT_FOR_CLIENT_REASON
        : OWNER_VOICE_REFUSED_REASON

      const text = String(args?.text ?? '').trim()
      if (!text) return { done: false, reason: 'text is empty' }
      if (text.length > VOICE_CLONE_MAX_CHARS)
        return {
          done: false,
          reason: `text is ${text.length} characters; the limit is ${VOICE_CLONE_MAX_CHARS} -- split it`,
        }
      const lang = String(args?.lang ?? 'ru')
        .trim()
        .toLowerCase()
      if (!LANG_SHAPE.test(lang))
        return { done: false, reason: `lang "${lang}" is not a language code` }

      const env = deps.env()
      if (!env.key)
        return {
          done: false,
          reason:
            'voice-clone service is not configured on the render service (no VOICE_CLONE_KEY)',
        }

      const given = String(args?.ref_url ?? '').trim()
      /*
       * The owner's sample is the owner's voice. Its own address passed by
       * hand is refused here, cheaply, before anything is fetched; other
       * spellings of it are caught by content after the download below.
       */
      if (given && env.ownerRef && sameRef(given, env.ownerRef) && !ownerVoice)
        return { done: false, reason: ownerRefused }
      let ref = given
      if (!ref) {
        if (owner && !ownerVoice)
          return { done: false, reason: OWNER_VOICE_NOT_FOR_CLIENT_REASON }
        if (!owner)
          return {
            done: false,
            reason:
              "ref_url is required: an audio sample of your own voice (the owner's voice is for the owner only)",
          }
        if (!env.ownerRef)
          return {
            done: false,
            reason:
              "the owner's voice sample is not configured (no OWNER_VOICE_REF_URL) -- pass ref_url",
          }
        ref = env.ownerRef
      }

      const sample = await deps.sample(ref, VOICE_CLONE_SAMPLE_MAX_BYTES)
      if (!sample.ok) return { done: false, reason: sample.why }
      if (!sample.bytes.length)
        return { done: false, reason: 'the voice sample is empty' }

      /*
       * THE OWNER'S SAMPLE BY CONTENT, NOT BY ADDRESS. One shelf object has
       * many spellings (host or scheme in capitals, the bucket's virtual-host
       * form, the render's /s3/ proxy over http, a doubled slash), and the
       * address check above knows only some of them. So the downloaded bytes
       * are hashed and compared with the owner sample's hash; a match from
       * anyone but the owner -- keepers included -- is refused. If the
       * owner's hash cannot be had, the call is refused, not let through.
       *
       * What this does NOT promise: it blocks the easy path only (the same
       * file under another name). Anyone can still re-record or cut his voice
       * out of the owner's published reels and bring that as a new sample;
       * those bytes hash differently, and no hash comparison can stop it.
       */
      if (!ownerVoice && env.ownerRef) {
        const ownerHash = await ownerSampleHash(env.ownerRef)
        if (!ownerHash)
          return {
            done: false,
            reason:
              "could not check the sample against the owner's voice -- try again later",
          }
        if (sha256(sample.bytes) === ownerHash)
          return { done: false, reason: ownerRefused }
      }

      let res: Response
      try {
        res = await deps.fetch(`${env.url.replace(/\/+$/, '')}/speak`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: text,
            lang,
            ref_b64: sample.bytes.toString('base64'),
          }),
          signal: AbortSignal.timeout(VOICE_CLONE_TIMEOUT_MS),
        })
      } catch (e) {
        return {
          done: false,
          reason: `voice-clone service did not answer (${String(e).slice(0, 120)})`,
        }
      }
      if (res.status === 429 || res.status === 503)
        return {
          done: false,
          busy: true,
          retry_after: retryAfterSeconds(res.headers.get('Retry-After')),
          reason:
            'voice-clone service is busy with another synthesis (one at a time) -- try again in a minute or two',
        }
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 200)
        return {
          done: false,
          reason: `voice-clone service refused: HTTP ${res.status}${detail ? ` ${detail}` : ''}`,
        }
      }
      const wav = Buffer.from(await res.arrayBuffer())
      if (!wav.length)
        return { done: false, reason: 'voice-clone service returned no audio' }
      const secondsRaw = Number(res.headers.get('X-Seconds'))
      const seconds =
        Number.isFinite(secondsRaw) && secondsRaw > 0 ? secondsRaw : null

      const url = await deps.put(
        wav,
        'audio/wav',
        `voice-clone-${Date.now()}.wav`
      )
      if (!url)
        return {
          done: false,
          reason: 'the audio was made but could not be stored',
        }
      return { done: true, url, seconds }
    },
  }
}

/** Waiting on a busy service: how long, how often, and until when. */
export interface BusyRetryOptions {
  /** Total time one line may spend waiting on "busy", from its first try. */
  deadlineMs: number
  /** First wait; doubled after every busy answer, up to maxWaitMs. */
  firstWaitMs: number
  maxWaitMs: number
  sleep: (ms: number) => Promise<void>
  now: () => number
}

/** The owner's reel lines (tools.ts ownerVoiceViaOurClone). */
export const OUR_CLONE_BUSY_RETRY: Pick<
  BusyRetryOptions,
  'deadlineMs' | 'firstWaitMs' | 'maxWaitMs'
> = {
  deadlineMs: 6 * 60_000,
  firstWaitMs: 10_000,
  maxWaitMs: 60_000,
}

/**
 * Call `attempt` until it is not busy, with backoff and one overall deadline.
 * Each wait is the longer of the backoff step and the service's own
 * Retry-After; a wait that would cross the deadline is not started, and the
 * last busy answer comes back with the reason saying so. Never throws: a
 * thrown attempt is a plain refusal.
 */
export async function speakWithBusyRetry(
  attempt: () => Promise<any>,
  opts: BusyRetryOptions
): Promise<any> {
  const until = opts.now() + opts.deadlineMs
  let step = opts.firstWaitMs
  for (;;) {
    const out: any = await attempt().catch((e: unknown) => ({
      done: false,
      reason: String(e).slice(0, 160),
    }))
    if (!out?.busy) return out
    const asked =
      Number(out.retry_after) > 0 ? Number(out.retry_after) * 1000 : 0
    const wait = Math.max(step, asked)
    if (opts.now() + wait > until)
      return {
        ...out,
        reason: `${out.reason || 'busy'} (gave up after ${Math.round(opts.deadlineMs / 1000)} s of waiting)`,
      }
    await opts.sleep(wait)
    step = Math.min(step * 2, opts.maxWaitMs)
  }
}
