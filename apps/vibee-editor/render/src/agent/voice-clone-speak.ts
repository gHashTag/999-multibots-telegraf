/**
 * voice_clone_speak -- text spoken in a cloned voice, by OUR OWN zero-shot
 * service (deployment/voice-clone, Railway service `voice-clone`).
 *
 * Kie has no speech cloning (skill kie-only), so the owner's generated voice
 * comes from here. The service takes one audio sample and the text and
 * answers with a WAV; nothing is trained and nothing is kept on its side.
 *
 * Contract (deployment/voice-clone/server.py): POST /speak with a Bearer key
 * and {input, lang, ref_b64}; audio/wav back with X-Seconds. 429/503 while
 * another synthesis runs -- one at a time on CPU. The model behind the door
 * may change, so nothing here assumes one.
 *
 * NOT CHARGED. The service is our own CPU box (cost ~0), like reel_analyze:
 * no provider bills us per call, so there is no TOKEN_PRICES entry and no
 * spendTokens here (nothing-free-is-charged.test.ts keeps the two in step).
 *
 * Dependencies are parameters so the whole path runs in a test without a
 * shelf, a network or the service; `LIVE_VOICE_SAMPLE` is the real loader.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTool, ToolContext } from './tools'
import { proxyShelfUrl, shelfKeyOf } from './lipsync-voice'
import { withShelfFile } from './media-extract'
import { resolveFinalUrl } from './web-guard'
import { downloadBoundedMediaToFile } from '../lib/remoteMediaDuration'

/** The service refuses longer text (server.py MAX_CHARS). */
export const VOICE_CLONE_MAX_CHARS = 600
/** The service refuses a bigger sample (server.py MAX_REF_BYTES). */
export const VOICE_CLONE_SAMPLE_MAX_BYTES = 8 * 1024 * 1024
/** CPU synthesis of 600 characters takes minutes, not seconds. */
export const VOICE_CLONE_TIMEOUT_MS = 300_000
/** The private Railway address; reachable only from inside the project. */
export const VOICE_CLONE_DEFAULT_URL =
  'http://voice-clone.railway.internal:8080'

export interface VoiceCloneEnv {
  url: string
  key: string
  /** The owner's own voice sample; used only for the owner or a keeper. */
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
  /** The owner or a keeper: the only people who may speak in the owner's voice. */
  mayUseOwnerVoice: (who: string) => boolean
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

/** Two spellings of one shelf object (proxy or bucket address) are one sample. */
function sameRef(a: string, b: string): boolean {
  if (a === b) return true
  const ka = shelfKeyOf(a)
  return !!ka && ka === shelfKeyOf(b)
}

export function makeVoiceCloneSpeakTool(deps: VoiceCloneSpeakDeps): AgentTool {
  return {
    name: 'voice_clone_speak',
    description:
      'Speak text in a cloned voice: our own zero-shot voice-clone service, ' +
      'free (no tokens). Give the text (up to 600 characters) and ref_url -- ' +
      'an audio sample of the voice (a few seconds of clean speech; a file on ' +
      'our shelf or a public link, up to 8 MB). Without ref_url it speaks in ' +
      "the owner's own voice, but only for the owner or a keeper. Returns " +
      '{url, seconds}: a WAV on our shelf, usable as voice_url in ' +
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

      const who = String(ctx?.telegramId ?? '').trim()
      const owner = deps.mayUseOwnerVoice(who)
      const given = String(args?.ref_url ?? '').trim()
      /*
       * The owner's sample is the owner's voice. Passing its address by hand
       * is the same as leaving ref_url out, and is refused the same way.
       */
      if (given && env.ownerRef && sameRef(given, env.ownerRef) && !owner)
        return {
          done: false,
          reason:
            "the owner's voice is for the owner only -- pass a sample of your own voice",
        }
      let ref = given
      if (!ref) {
        if (!owner)
          return {
            done: false,
            reason:
              'ref_url is required: an audio sample of the voice to speak in',
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
