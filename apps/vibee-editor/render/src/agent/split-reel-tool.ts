/**
 * split_reel -- the split reel as ONE server call (split-reel.t27).
 *
 * Owner's rule, 2026-10-03: reels are made only through the render server's
 * own tools, never by hand on a Mac. Until this tool the split format had a
 * spec and a plan (split-reel-plan.ts) but no tool that ran the chain, so
 * every split reel was assembled outside the server.
 *
 * The chain, each part borrowed from the registry so it charges and refunds
 * exactly as when called alone:
 *
 *   estimate -- a new voice is estimated from its text at MS_PER_CHAR; too
 *               long for SPEECH_MAX_SECONDS is refused BEFORE the voice is
 *               paid for (split-reel v8)
 *   voice    -- audio_generate (the owner's clone on the house's own reel;
 *               a client's reel speaks the client's voice -- split-reel v7)
 *   gate     -- the voice is measured; longer than SPEECH_MAX_SECONDS is
 *               refused BEFORE any still or lip-sync is paid for (the
 *               backstop for a voice slower than the measured pace). The
 *               one refusal after a charge, so a voice THIS call paid for
 *               is given back, once (split-reel v8 backstop_refund)
 *   b-roll   -- image_edit with the spec's BROLL_MODEL, one still per split
 *               shot the voice actually needs, all at once, no text in them
 *   lip-sync -- lipsync_generate with the spec's LIPSYNC_MODEL
 *   captions -- the FINAL voice (the clip's own soundtrack) heard by our own
 *               whisper with word times, each start snapped to the sound
 *   reel     -- reel_render SplitTalkingHead with splitReelProps()
 *
 * RESUMABLE, NOT REPAID. Every answer, done or not, carries the parts made
 * so far (voice_url, clip, broll_urls); the next call passes them back and
 * nothing already paid for is made twice.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentTool } from './tools'
import * as SPEC from '../spec/split-reel.gen'
import {
  agentSuppliedHouseName,
  captionsFromWords,
  framesForSeconds,
  houseNameAllowed,
  houseOwnTurn,
  leadOfTurn,
  backstopRefund,
  msOfSeconds,
  speechFrames,
  speechChars,
  speechMsEstimate,
  splitReelProps,
  splitSegments,
  textFits,
  voiceTooLong,
  type SpeechFrames,
  type SpokenWord,
} from '../split-reel-plan'
import { clientCtaOf, STORY_DEFAULT_CTA } from './story-template'
import { isHouse } from '../house-ids'
import { whisperConfig, whisperWords } from './media-library'
import { withShelfFile } from './media-extract'
import { probeSeconds, proxyShelfUrl, shelfKeyOf } from './lipsync-voice'
import { reelExec } from './reel-analyze'

/** What the final voice of a clip sounds like, for its captions. */
export interface HeardVoice {
  words: SpokenWord[]
  speech?: SpeechFrames
}

/** The two senses the tool needs; injectable so tests need no ffmpeg. */
export interface SplitReelSenses {
  /** Length of a file on our shelf, seconds; 0 when it cannot be measured. */
  length(url: string): Promise<number>
  /** The clip's own soundtrack, heard; a string says why it could not be. */
  hear(url: string, language?: string): Promise<HeardVoice | string>
}

/** The most stills a reel can show: split shots in the longest reel. */
export function splitShotsFor(seconds: number): number {
  return splitSegments(framesForSeconds(seconds)).filter(
    s => s.type === 'split'
  ).length
}
const MOST_BROLLS = splitShotsFor(SPEC.MAX_SECONDS)

/** The prompt of one b-roll still: the setting, and no text (TEXT_IN_BROLL). */
export function brollPrompt(setting: string): string {
  const base =
    `${setting.trim()}. Photorealistic vertical frame, the same person, ` +
    'natural light, sharp focus.'
  return SPEC.TEXT_IN_BROLL
    ? base
    : `${base} No text, no letters, no captions, no logos, no watermarks.`
}

/** Where the last word ends, seconds: the call to action starts there. */
export function speechEnd(words: readonly SpokenWord[]): number {
  return words.reduce((m, w) => Math.max(m, w.end), 0)
}

/** ISO code for whisper when the text says it plainly; undefined otherwise. */
export function languageOf(text: string): string | undefined {
  return /[\u0400-\u04FF]/.test(text) ? 'ru' : undefined
}

/* ── the senses on the server ───────────────────────────────────────────── */

/** A split reel's clip is seconds of video; anything bigger is not one. */
const CLIP_MAX_BYTES = 100 * 1024 * 1024
/** Sample rate the soundtrack is decoded at for the speech frames. */
const PCM_RATE = 16_000
const WHISPER_WAIT_MS = 120_000

async function shelfLength(url: string): Promise<number> {
  const key = shelfKeyOf(url)
  if (!key) return 0
  const got = await withShelfFile(proxyShelfUrl(key), CLIP_MAX_BYTES, p =>
    probeSeconds(p)
  ).catch(() => 0)
  return typeof got === 'number' ? got : 0
}

async function hearOnShelf(
  url: string,
  language?: string
): Promise<HeardVoice | string> {
  const w = whisperConfig()
  if (!w) return 'whisper не настроен на этом сервере'
  const key = shelfKeyOf(url)
  if (!key) return 'ролик не на нашей полке'
  const got = await withShelfFile(
    proxyShelfUrl(key),
    CLIP_MAX_BYTES,
    async file => {
      const dir = await mkdtemp(join(tmpdir(), 'split-reel-'))
      try {
        const raw = join(dir, 'voice.pcm')
        const mp3 = join(dir, 'voice.mp3')
        await reelExec('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-vn',
          '-ac',
          '1',
          '-ar',
          String(PCM_RATE),
          '-f',
          's16le',
          '-y',
          raw,
        ])
        await reelExec('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-vn',
          '-ac',
          '1',
          '-b:a',
          '64k',
          '-y',
          mp3,
        ])
        const buf = await readFile(raw)
        const even = buf.length - (buf.length % 2)
        const pcm = new Int16Array(
          buf.buffer.slice(buf.byteOffset, buf.byteOffset + even)
        )
        const words = await whisperWords(
          w,
          await readFile(mp3),
          'audio/mpeg',
          'voice.mp3',
          WHISPER_WAIT_MS,
          language
        )
        return { words, speech: speechFrames(pcm, PCM_RATE) }
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  ).catch(e => `не расслышал ролик: ${String(e?.message ?? e)}`)
  if (got === 'missing') return 'ролика нет на полке'
  if (got === 'too-big') return 'ролик слишком большой'
  return got
}

export const SERVER_SENSES: SplitReelSenses = {
  length: shelfLength,
  hear: hearOnShelf,
}

/* ── the tool ───────────────────────────────────────────────────────────── */

type Tool = AgentTool | undefined

/** A borrowed tool's answer, read the same whichever language it answers in. */
function outcome(v: any): {
  ok: boolean
  url: string
  why: string
  pending: boolean
  seconds: number
  voice: string
  /** What the borrowed tool's charge took, from its receipt; 0 when none. */
  charged: number
} {
  const ok =
    v?.done === true || v?.['сделано'] === true || v?.['готово'] === true // cyrillic-ok: borrowed tools' answer keys
  return {
    ok,
    url: String(v?.url ?? ''),
    why: String(v?.reason ?? v?.['причина'] ?? v?.error ?? ''), // cyrillic-ok: borrowed tools' answer keys
    pending: v?.pending === true,
    seconds: Number(v?.seconds) || 0,
    voice: String(v?.['голос'] ?? ''), // cyrillic-ok: borrowed tools' answer keys
    charged: Number(v?.['токены']?.['потрачено']) || 0, // cyrillic-ok: borrowed tools' answer keys
  }
}

const isUrl = (v: unknown): v is string =>
  typeof v === 'string' && /^https?:\/\//.test(v.trim())

export function makeSplitReelTool(
  lookup: (name: string) => Tool,
  senses: SplitReelSenses = SERVER_SENSES
): AgentTool {
  return {
    name: 'split_reel',
    description:
      `СПЛИТ-РИЛС ОДНИМ ВЫЗОВОМ (шаблон ${SPEC.COMPOSITION}, спека split-reel.t27): кадр с лицом в студии ` +
      `(${SPEC.FACE_SPEC}) + текст → голос (рилс владельца — его клон; рилс клиента — голос клиента) → липсинк ` +
      `${SPEC.LIPSYNC_MODEL} → b-roll кадры для сплит-половин (${SPEC.BROLL_MODEL}, без надписей) → ` +
      `жёлтые титры по слову из ИТОГОВОГО голоса (свой whisper) → сборка: полный кадр, сплит, полный, ` +
      `в конце пауза ${SPEC.CTA_PAUSE_SEC} с с призывом. Речь до ${SPEC.SPEECH_MAX_SECONDS} с. ` +
      'Рилс клиента (for_lead или разговор с клиентом) — его голос и его призыв; Тринити и бота владельца сам не вставляй, слова человека — его. ' +
      'Вернулись voice_url/clip/broll_urls без видео — повтори с ними: готовое не делается и не оплачивается второй раз.',
    parameters: {
      type: 'object',
      properties: {
        image_url: {
          type: 'string',
          description: `кадр с лицом на нашей полке: студийный кадр (${SPEC.FACE_SPEC}) владельца или клиента`,
        },
        text: {
          type: 'string',
          description: `что сказать, до ${SPEC.SPEECH_MAX_SECONDS} с речи (до ~${Math.floor((SPEC.SPEECH_MAX_SECONDS * 1000) / SPEC.MS_PER_CHAR)} знаков); бот в речи — «Тринити» только в рилсе владельца`,
        },
        brolls: {
          type: 'array',
          items: { type: 'string' },
          description: `обстановка для каждого сплит-кадра по порядку (до ${MOST_BROLLS}), без надписей`,
        },
        for_lead: {
          type: 'string',
          description: 'id клиента: говорить ЕГО голосом (crm_voice_clone)',
        },
        cta: {
          type: 'string',
          description:
            'надпись в паузе в конце; по умолчанию — призыв клиента из его профиля, бот владельца только в рилсе владельца',
        },
        voice_url: {
          type: 'string',
          description:
            'готовый голос из прошлого ответа — не озвучивать заново',
        },
        clip: {
          type: 'string',
          description: 'готовый липсинк из прошлого ответа — не делать заново',
        },
        broll_urls: {
          type: 'array',
          items: { type: 'string' },
          description:
            'готовые b-roll кадры из прошлого ответа — не рисовать заново',
        },
      },
      required: ['image_url', 'text', 'brolls'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      // Everything that can refuse for free refuses before any charge.
      const source = String(args.image_url ?? '').trim()
      if (!isUrl(source))
        return { done: false, reason: 'image_url: ссылка на кадр с лицом' }
      const text = String(args.text ?? '').trim()
      if (!text) return { done: false, reason: 'text: что сказать' }
      const settings = (Array.isArray(args.brolls) ? args.brolls : [])
        .map(s => String(s ?? '').trim())
        .filter(Boolean)
      if (!settings.length || settings.length > MOST_BROLLS)
        return {
          done: false,
          reason: `brolls: от 1 до ${MOST_BROLLS} обстановок для сплит-кадров`,
        }
      /*
       * Whose reel this is (split-reel v7), from code-set fields only: the
       * wallet (the house's or a seller's), the turn's client (ctx.faceOf),
       * the order's for_lead, an unattended sweep. Only the house's own reel
       * ends on its bot; a client's speaks her voice and ends on her call.
       */
      const turn = {
        house: isHouse(ctx.telegramId),
        faceOf: ctx.faceOf,
        sellerSweep: ctx.sellerSweep,
      }
      const forClient = String(turn.faceOf ?? '').trim()
      const named = String(args.for_lead ?? '')
        .trim()
        .replace(/^@/, '')
      if (forClient && named && named !== forClient)
        return {
          done: false,
          reason: 'в разговоре с клиентом рилс делается только его голосом',
        }
      const forLead = leadOfTurn(named, turn)
      const house = houseOwnTurn(turn, forLead)
      // Her own words stand; a house name the agent put in does not.
      if (!houseNameAllowed(house, agentSuppliedHouseName(text, ctx.ownerSaid)))
        return {
          done: false,
          reason:
            'рилс не для владельца не называет ни Тринити, ни бота владельца, если человек сам этого не написал: убери их из text',
        }
      const edit = lookup('image_edit')
      const speak = lookup('audio_generate')
      const lip = lookup('lipsync_generate')
      const render = lookup('reel_render')
      if (!edit || !speak || !lip || !render)
        return {
          done: false,
          reason: 'инструменты рилса недоступны на этом сервере',
        }

      const language = languageOf(text)
      let voiceUrl = isUrl(args.voice_url) ? args.voice_url.trim() : ''
      let clip = isUrl(args.clip) ? args.clip.trim() : ''
      const given = Array.isArray(args.broll_urls) ? args.broll_urls : []
      const stills: string[] = settings.map((_, i) =>
        isUrl(given[i]) ? String(given[i]).trim() : ''
      )
      const sofar = () => ({
        ...(voiceUrl ? { voice_url: voiceUrl } : {}),
        ...(clip ? { clip } : {}),
        broll_urls: stills,
        how_to_continue:
          'повтори split_reel с теми же image_url, text и brolls и этими voice_url, clip и broll_urls: ' +
          'готовое не делается и не оплачивается второй раз',
      })

      // 0. A new voice too long for the format is refused from its text,
      // before it is paid for (split-reel v8 text_fits). The measured gate
      // in step 2 stays, for a voice slower than the measured pace.
      const chars = speechChars(text)
      if (!voiceUrl && !clip && !textFits(chars))
        return {
          done: false,
          reason:
            `text на ~${Math.ceil(speechMsEstimate(chars) / 1000)} с речи, а формат держит до ` +
            `${SPEC.SPEECH_MAX_SECONDS} с: сократи text — голос не заказан и не оплачен`,
          ...sofar(),
        }

      // 1. The voice, unless it came back from the last call.
      let voiceKind = ''
      let spoken = 0
      // Whether THIS call paid for the voice, and what it took: the backstop
      // gives back only a voice it paid for (v8 backstop_refund).
      let paidHere = false
      let chargedNow = 0
      if (!voiceUrl && !clip) {
        const v = outcome(
          await speak
            .handler(
              {
                text,
                ...(forLead ? { for_lead: forLead } : {}),
              },
              ctx
            )
            .catch(e => ({ done: false, reason: String(e) }))
        )
        if (!v.ok || !v.url)
          return { done: false, reason: `голос: ${v.why}`, ...sofar() }
        voiceUrl = v.url
        voiceKind = v.voice
        spoken = v.seconds
        paidHere = true
        chargedNow = v.charged
      }

      // 2. The gate: a voice too long for the format is refused before the
      // stills and the lip-sync, which are the parts priced per piece.
      spoken ||= await senses.length(clip || voiceUrl).catch(() => 0)
      if (!clip && !spoken)
        return {
          done: false,
          reason: 'не удалось измерить длину голоса — липсинк не заказан',
          ...sofar(),
        }
      if (!clip && voiceTooLong(msOfSeconds(spoken))) {
        const tooLong = voiceUrl
        voiceUrl = ''
        // The one refusal after the charge: the voice this call paid for
        // goes back, the exact sum, once per voice (v8 backstop_refund).
        const back = backstopRefund(paidHere, msOfSeconds(spoken), chargedNow)
        let returned = false
        if (back > 0) {
          // Imported here: tools.ts imports this file to build its list.
          const { refundTooLongVoice } = await import('./tools')
          returned = await refundTooLongVoice(
            ctx,
            { url: tooLong, charged: back },
            'голос длиннее формата сплит-рилса'
          )
        }
        return {
          done: false,
          reason:
            `голос ${spoken.toFixed(1)} с, а формат держит до ${SPEC.SPEECH_MAX_SECONDS} с речи: ` +
            `сократи text и повтори без voice_url (длинный голос: ${tooLong})` +
            (returned ? `; ${back} ток. за этот голос возвращены` : ''),
          ...sofar(),
        }
      }

      // 3. The b-roll stills the voice needs, all at once: a short voice has
      // fewer split shots than settings, and pays for fewer stills.
      const needed = spoken
        ? Math.min(stills.length, splitShotsFor(spoken))
        : stills.filter(Boolean).length
      const failed: string[] = []
      await Promise.all(
        settings.slice(0, needed).map(async (setting, i) => {
          if (stills[i]) return
          const r = outcome(
            await edit
              .handler(
                {
                  image_url: source,
                  prompt: brollPrompt(setting),
                  model: SPEC.BROLL_MODEL,
                },
                ctx
              )
              .catch(e => ({ done: false, reason: String(e) }))
          )
          if (r.ok && r.url) stills[i] = r.url
          else
            failed.push(
              r.pending
                ? `b-roll ${i + 1}: ещё рисуется (оплачен, придёт в «мои файлы» — возьми его в broll_urls)`
                : `b-roll ${i + 1}: ${r.why}`
            )
        })
      )
      const bRolls = stills.slice(0, needed).filter(Boolean)
      if (bRolls.length < needed)
        return { done: false, reason: failed.join('; '), ...sofar() }

      // 4. The lip-sync, unless it came back from the last call.
      if (!clip) {
        const c = outcome(
          await lip
            .handler(
              {
                image_url: source,
                voice_url: voiceUrl,
                model: SPEC.LIPSYNC_MODEL,
              },
              ctx
            )
            .catch(e => ({ done: false, reason: String(e) }))
        )
        if (!c.ok || !c.url)
          return { done: false, reason: `липсинк: ${c.why}`, ...sofar() }
        clip = c.url
      }

      // 5. Captions from the FINAL voice: the clip's own soundtrack.
      const heard = await senses
        .hear(clip, language)
        .catch(e => `не расслышал ролик: ${String(e)}`)
      if (typeof heard === 'string')
        return { done: false, reason: `титры: ${heard}`, ...sofar() }
      if (!heard.words.length)
        return {
          done: false,
          reason:
            'титры: whisper не вернул слов со временем — без титров рилс не собран (липсинк сохранён)',
          ...sofar(),
        }
      const seconds = speechEnd(heard.words)
      const captions = captionsFromWords(heard.words, 0, heard.speech)

      // 6. The template, ending on the call the spec picks (v7).
      const props = splitReelProps({
        lipSyncVideo: clip,
        seconds,
        bRolls,
        captions,
        call: {
          house,
          given: String(args.cta ?? '').trim(),
          client: house
            ? ''
            : await clientCtaOf(ctx.pool, String(ctx.telegramId), forLead),
          neutral: STORY_DEFAULT_CTA,
        },
      })
      const r = outcome(
        await render
          .handler({ compositionId: SPEC.COMPOSITION, props }, ctx)
          .catch(e => ({ done: false, reason: String(e) }))
      )
      if (!r.ok || !r.url)
        return { done: false, reason: `сборка: ${r.why}`, ...sofar() }
      return {
        done: true,
        url: r.url,
        voice_url: voiceUrl,
        clip,
        broll_urls: bRolls,
        ...(voiceKind ? { voice: voiceKind } : {}),
        captions: captions.length,
        seconds: Math.round((seconds + SPEC.CTA_PAUSE_SEC) * 10) / 10,
        ...(SPEC.REEL_CHECK_BEFORE_SEND
          ? {
              check_before_sending:
                'сверка титров с голосом (tri reel-check) на сервере не запускалась',
            }
          : {}),
        give_to_person: r.url,
      }
    },
  }
}
