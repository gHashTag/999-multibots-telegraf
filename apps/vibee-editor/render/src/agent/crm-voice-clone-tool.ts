/**
 * crm_voice_clone -- a client's own voice, from the voice notes she sent the
 * owner, for the gift made for her (owner, 2026-09-26: "about her business,
 * so she can post it to Instagram, with her photo, and use her voice from the
 * chat").
 *
 * The rules and the numbers live in lead-voice.ts. This file is the tool: it
 * resolves the person, refuses a person who told the assistant to stop, looks
 * for a clone the owner already paid for, and only then fetches her notes,
 * joins them, charges, clones and keeps the id against (owner, lead).
 *
 * Dependencies are parameters so the whole path runs in a test without a
 * Telegram session, a shelf or Replicate; `LIVE_NOTES` is the real fetch.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AgentTool, ToolContext } from './tools'
import {
  LEAD_VOICE_GOOD_SECONDS,
  LEAD_VOICE_MAX_SECONDS,
  LEAD_VOICE_MIN_SECONDS,
  LEAD_VOICE_SCAN,
  leadVoiceOf,
  saveLeadVoice,
} from './lead-voice'
import { refuseIfClientStopped } from './assistant-opt-out'

/** Her voice notes in the owner's private chat with her, newest first. */
export interface LeadNotes {
  /** Her Telegram id; null when the chat is not a private chat with a person. */
  lead: string | null
  files: Buffer[]
  /** What Telegram says the notes last, summed; the joined file is measured again. */
  seconds: number
}

export interface LeadVoiceDeps {
  notes: (ctx: ToolContext, chat: string) => Promise<LeadNotes>
  charge: (
    ctx: ToolContext
  ) => Promise<{ ok: true; spent: number } | { ok: false; why: string }>
  refund: (ctx: ToolContext, why: string, spent: number) => Promise<void>
  /** Bytes onto our shelf; the URL must be one the provider can fetch. */
  put: (bytes: Buffer, name: string, mime: string) => Promise<{ url: string }>
  join: (inputs: string[], output: string) => Promise<number>
  clone: (voiceFileUrl: string) => Promise<string>
  price: number
}

type GramMessage = {
  id?: number
  out?: boolean
  peerId?: { className?: string; userId?: { toString(): string } }
  media?: {
    document?: {
      attributes?: Array<{ className?: string; duration?: number }>
    }
  }
}

/** How long Telegram says a voice note is, seconds (0 when it does not say). */
export function noteSeconds(m: GramMessage): number {
  const a = m?.media?.document?.attributes?.find(
    x => x?.className === 'DocumentAttributeAudio'
  )
  const d = Number(a?.duration)
  return Number.isFinite(d) && d > 0 ? d : 0
}

/**
 * Her notes only: the owner's own notes in the same chat are the OWNER's
 * voice, and a clone of a mixture is nobody's.
 */
export function herNotes(list: readonly GramMessage[]): GramMessage[] {
  return list.filter(m => m && typeof m.id === 'number' && !m.out)
}

/** The other person of a private chat, from the messages themselves. */
export function personOf(
  list: readonly GramMessage[],
  chat: string
): string | null {
  const peer = list.find(m => m?.peerId)?.peerId
  if (peer?.className === 'PeerUser' && peer.userId !== undefined)
    return String(peer.userId)
  if (peer) return null
  return /^\d{5,15}$/.test(chat) ? chat : null
}

export const LIVE_NOTES = async (
  ctx: ToolContext,
  chat: string
): Promise<LeadNotes> => {
  const { withClient } = await import('./telegram-tools')
  const { resolvingPeer } = await import('./tg-proposals')
  return withClient(ctx, c =>
    resolvingPeer(c, chat, async () => {
      const { Api } = await import('telegram')
      const found = (await c.getMessages(chat, {
        filter: new Api.InputMessagesFilterVoice(),
        limit: LEAD_VOICE_SCAN,
      })) as GramMessage[]
      const lead = personOf(found, chat)
      if (!lead) return { lead: null, files: [], seconds: 0 }
      const files: Buffer[] = []
      let seconds = 0
      for (const m of herNotes(found)) {
        if (seconds >= LEAD_VOICE_MAX_SECONDS) break
        if (typeof c.downloadMedia !== 'function') break
        const got = await c.downloadMedia(m, {})
        const buf = Buffer.isBuffer(got)
          ? got
          : got instanceof Uint8Array
            ? Buffer.from(got)
            : null
        if (!buf?.length) continue
        files.push(buf)
        seconds += noteSeconds(m)
      }
      return { lead, files, seconds }
    })
  )
}

const SHORT_NOTE =
  'записи мало — голос может звучать неточно; попроси ещё голосовое, если важно'

export function makeLeadVoiceTool(deps: LeadVoiceDeps): AgentTool {
  return {
    name: 'crm_voice_clone',
    description:
      'Клон голоса клиента из ЕГО голосовых в твоей личке с ним — чтобы его подарок (рилс про его дело) ' +
      `говорил его голосом. Берутся только его голосовые, не твои; нужно от ${LEAD_VOICE_MIN_SECONDS} с, ` +
      `лучше ${LEAD_VOICE_GOOD_SECONDS}+. Цена ${deps.price} ток., один раз на человека: готовый клон ` +
      'не оплачивается снова. Говорить им — audio_generate {text, for_lead}. Только для материалов ЕМУ ЖЕ: ' +
      'его голосом не озвучивай ничего для других и не публикуй от его имени.',
    parameters: {
      type: 'object',
      properties: {
        chat: {
          type: 'string',
          description: '@username или id клиента (личный чат с ним)',
        },
      },
      required: ['chat'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const owner = String(ctx?.telegramId ?? '').trim()
      if (!owner) throw new Error('Не знаю, кто спрашивает.')
      const chat = String(args?.chat ?? '').trim()
      if (!chat) throw new Error('chat: @username или id клиента')
      /*
       * In a turn working FOR a client, only that client's own voice: a
       * sentence in her message must not name a stranger and get a clone of
       * them made on the owner's account.
       */
      if (ctx.faceOf && chat.replace(/^@/, '') !== String(ctx.faceOf)) {
        return {
          сделано: false, // cyrillic-ok: the tools’ answer fields
          причина: 'в разговоре с клиентом можно клонировать только его голос', // cyrillic-ok: the tools’ answer fields
        }
      }

      const already = await leadVoiceOf(ctx.pool, owner, chat)
      if (already) {
        await refuseIfClientStopped(ctx, already.lead)
        return {
          сделано: true, // cyrillic-ok: the tools’ answer fields
          уже_был: true, // cyrillic-ok: the tools’ answer fields
          for_lead: already.lead,
          секунд_записи: already.seconds, // cyrillic-ok: the tools’ answer fields
          дальше: `audio_generate {text, for_lead: "${already.lead}"}`, // cyrillic-ok: the tools’ answer fields
        }
      }

      const got = await deps.notes(ctx, chat)
      if (!got.lead) {
        const why =
          'это не личный чат с человеком — голос клонируется только из лички'
        return { сделано: false, причина: why } // cyrillic-ok: the tools’ answer fields
      }
      await refuseIfClientStopped(ctx, got.lead)
      if (!got.files.length) {
        const why =
          'он не присылал голосовых. Попроси голосовое на 15–30 с о его деле — ' +
          'из него сделаю его голос'
        return { сделано: false, причина: why } // cyrillic-ok: the tools’ answer fields
      }

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-voice-'))
      try {
        const inputs = got.files.map((b, i) => {
          const p = path.join(dir, `note-${i}.ogg`)
          fs.writeFileSync(p, b)
          return p
        })
        const joined = path.join(dir, 'voice.mp3')
        const seconds = await deps.join(inputs, joined)
        if (seconds < LEAD_VOICE_MIN_SECONDS) {
          const why =
            `его голосовых всего ${seconds.toFixed(1)} с, нужно от ${LEAD_VOICE_MIN_SECONDS}. ` +
            'Попроси голосовое на 15–30 с о его деле'
          return { сделано: false, причина: why } // cyrillic-ok: the tools’ answer fields
        }

        const charge = await deps.charge(ctx)
        if (!charge.ok) return { сделано: false, причина: charge.why } // cyrillic-ok: the tools’ answer fields
        try {
          const shelf = await deps.put(
            fs.readFileSync(joined),
            `lead-voice-${got.lead}.mp3`,
            'audio/mpeg'
          )
          const voiceId = await deps.clone(shelf.url)
          await saveLeadVoice(ctx.pool, {
            owner,
            lead: got.lead,
            username: chat.startsWith('@') ? chat : null,
            voiceId,
            seconds,
            sourceUrl: shelf.url,
          })
          const shortNote =
            seconds < LEAD_VOICE_GOOD_SECONDS ? { note: SHORT_NOTE } : {}
          return {
            сделано: true, // cyrillic-ok: the tools’ answer fields
            for_lead: got.lead,
            секунд_записи: Number(seconds.toFixed(1)), // cyrillic-ok: the tools’ answer fields
            ...shortNote,
            потрачено: charge.spent, // cyrillic-ok: the tools’ answer fields
            дальше: `audio_generate {text, for_lead: "${got.lead}"}`, // cyrillic-ok: the tools’ answer fields
          }
        } catch (e) {
          await deps.refund(ctx, 'клон голоса не удался', charge.spent)
          return {
            сделано: false, // cyrillic-ok: the tools’ answer fields
            причина: `клон голоса не удался: ${String((e as Error)?.message ?? e).slice(0, 200)}`, // cyrillic-ok: the tools’ answer fields
          }
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    },
  }
}
