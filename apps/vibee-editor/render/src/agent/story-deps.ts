/**
 * The story template's live wiring: the chat model that writes the scenes,
 * the story_reel tool that makes the reel, and the Bot API that tells the
 * person. Kept apart from story-template.ts so the engine stays testable with
 * fakes, and from tools.ts so the registry is borrowed, not imported -- the
 * tool lives there, and a module cycle would be the alternative.
 */
import type { AgentTool, ToolContext } from './tools'
import type { StillTask } from './story-reel-tool'
import type { StoryDeps } from './story-template'
import { askBuyerModel } from './crm-duet-tool'
import { allProviders, diagnose } from './provider'
import { botNameOf, tokenForBot } from './bot-farm'
import { telegramApiFor } from '../telegram-api'
import { appLinkFor } from '../app-links'
import { issueFor, pendingFor } from './tg-proposals'
import { clientGroupFor } from './crm-client-group'
import { offerGroupCard, type CardPort } from './story-card'
import { voicesFromNotes } from './story-voice-notes'
import { LIVE_NOTES } from './crm-voice-clone-tool'
import { joinVoiceNotes, runTool } from './lead-voice'
import { s3PutBytes } from '../lib/s3-put'

type Pool = StoryDeps['pool']

const mainToken = () => (process.env.TELEGRAM_BOT_TOKEN || '').trim()

/**
 * One message in the bot the person pressed in. The video goes along unless
 * the render has already delivered it to this very chat through the same
 * (main) bot -- one reel, one copy.
 */
export async function notifyInBot(
  bot: string | null,
  chatId: string,
  text: string,
  extra: Parameters<StoryDeps['notify']>[3] = {},
  doFetch: typeof fetch = fetch
): Promise<boolean> {
  const main = mainToken()
  const farm = bot ? await tokenForBot(bot).catch(() => null) : null
  const token = farm?.token || main
  if (!token) return false
  const sameAsRender = !farm || farm.token === main
  const withVideo =
    Boolean(extra?.video) && !(extra?.renderSent && sameAsRender)
  const reply_markup = extra?.button?.url
    ? {
        inline_keyboard: [[{ text: extra.button.text, url: extra.button.url }]],
      }
    : undefined
  const body = withVideo
    ? { chat_id: chatId, video: extra!.video, caption: text, reply_markup }
    : { chat_id: chatId, text, reply_markup }
  try {
    const r = await doFetch(
      `${telegramApiFor(token)}/${withVideo ? 'sendVideo' : 'sendMessage'}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )
    return r.ok
  } catch {
    return false
  }
}

/**
 * The live card port: the draft is tg_send_video made AS THE SELLER on the
 * bot surface (the card is shown in his bot chat, where the press is taken),
 * the secret comes from issueFor under the job's own turn, and the card is
 * posted by the main bot -- the one whose tgp:ok / tgp:no presses the bot
 * process answers.
 */
export function liveCardPort(
  pool: Pool,
  lookup: (name: string) => AgentTool | undefined,
  doFetch: typeof fetch = fetch
): CardPort {
  return {
    queueFree: owner => pendingFor(owner) === null,
    draft: async (owner, turn, send) => {
      const tool = lookup('tg_send_video')
      if (!tool) return null
      const r: any = await tool.handler(
        { chat: send.chat, url: send.url, caption: send.caption, gift: true },
        { telegramId: owner, pool, surface: 'bot', turn } as never
      )
      return r?.proposal && r?.id ? { id: String(r.id) } : null
    },
    issue: (owner, turn) => {
      const p = issueFor(owner, turn)
      return p ? { id: p.id, secret: p.secret } : null
    },
    post: async (chatId, text, buttons, video) => {
      const token = mainToken()
      if (!token) return false
      const reply_markup = { inline_keyboard: buttons }
      const r = await doFetch(
        `${telegramApiFor(token)}/${video ? 'sendVideo' : 'sendMessage'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            video
              ? { chat_id: chatId, video, caption: text, reply_markup }
              : { chat_id: chatId, text, reply_markup }
          ),
        }
      )
      return r.ok
    },
  }
}

/** tools.ts refundLateImage, passed in: this module does not import the registry. */
export type RefundLate = (
  ctx: ToolContext,
  t: StillTask,
  why: string
) => Promise<void>

export function makeStoryDeps(
  pool: Pool,
  lookup: (name: string) => AgentTool | undefined,
  refundLate?: RefundLate
): StoryDeps {
  return {
    pool,
    ...(refundLate
      ? {
          refundStill: (payer: string, t: StillTask, why: string) =>
            refundLate(
              { telegramId: payer, pool: pool as ToolContext['pool'] },
              t,
              why
            ),
        }
      : {}),
    write: messages =>
      askBuyerModel(messages as never, allProviders(), fetch, (id, st, b) =>
        diagnose(id as never, st, b)
      ),
    story: (args, ctx) => {
      const tool = lookup('story_reel')
      if (!tool)
        return Promise.resolve({
          done: false,
          reason: 'story_reel недоступен на этом сервере',
        })
      return tool.handler(args, ctx)
    },
    notify: (bot, chatId, text, extra) => notifyInBot(bot, chatId, text, extra),
    botOf: lead => botNameOf(lead),
    offerCard: o => offerGroupCard(liveCardPort(pool, lookup), o),
    groupTitle: async (seller, lead, chat) => {
      const g = await clientGroupFor(pool as never, seller, lead)
      return g && g.chat_id === chat ? g.title : null
    },
    pageOf: bot => appLinkFor(bot, 'story'),
    // Her own voice notes, read with the SELLER's session from the seller's
    // chat with her (spec v4: NOTES_FROM_SELLER_DM_ONLY).
    voiceNotes: (seller, lead, parts) =>
      voicesFromNotes(
        {
          notes: LIVE_NOTES,
          join: joinVoiceNotes,
          ffmpeg: args => runTool('ffmpeg', args),
          put: (bytes, name, mime) => s3PutBytes(bytes, name, mime),
        },
        { telegramId: seller, pool: pool as ToolContext['pool'] },
        lead,
        parts
      ),
  }
}
