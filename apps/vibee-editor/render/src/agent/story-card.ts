/**
 * A FINISHED STORY REEL GOES TO THE CLIENT'S GROUP BY ONE PRESS.
 *
 * Owner, 2026-09-27: "build it into the pipeline, not scripts by hand". A
 * reel for a client with a group (crm_client_group) used to reach the seller
 * as a video to forward himself; the caption for the group was written by
 * hand, and a script did the rest. Now the job itself ends in a SEND CARD in
 * the seller's bot: the reel, the group it goes to, the caption, and the
 * same two buttons every card has. The press sends it from the seller's own
 * account through the path every other card uses (tg_send_video ->
 * /api/tg/proposal/confirm), so the rule "nothing reaches a client's chat
 * without the owner's press" is kept by construction, not by this file.
 *
 * ── ONE PRESSABLE CARD PER PERSON, AND THIS ONE WAITS ITS TURN ────────────
 *
 * The queue holds one issued card per person, and issuing a second one
 * drops the first (tg-proposals.ts issueFor); creating a draft drops that
 * person's unissued drafts (remember). A CRM card waiting for the seller may
 * carry a picture already paid for. So a reel's card is offered only when
 * the seller has nothing pending at all; otherwise the job keeps its card
 * for later and the story sweep offers it again when the queue is free.
 *
 * ── A SECOND DOOR FOR THE SECRET, ON PURPOSE ──────────────────────────────
 *
 * issueFor is "the only door the secret comes out of", keyed by the turn
 * that made the draft. A job is not a chat turn, so it gets a turn token of
 * its own (`story:<job id>`) and issues its own draft, once, into the
 * seller's own bot chat -- the same place and the same buttons as a card
 * drawn from an agent's answer.
 */

// The numbers are the spec's: gHashTag/t27 specs/automation/crm-story-reel.t27.
import * as SPEC from '../spec/crm-story-reel.gen'

export type CardOutcome = 'shown' | 'busy' | 'failed'

export interface CardPort {
  /** Nothing pending for this person: a new draft would displace nothing. */
  queueFree: (owner: string) => boolean
  /** The draft of the send (tg_send_video with the job's turn), or null. */
  draft: (
    owner: string,
    turn: string,
    send: { chat: string; url: string; caption: string }
  ) => Promise<{ id: string } | null>
  /** The draft's secret, handed out once (issueFor). */
  issue: (owner: string, turn: string) => { id: string; secret: string } | null
  /** One message in the seller's bot chat with the buttons under it. */
  post: (
    chatId: string,
    text: string,
    buttons: Array<Array<{ text: string; callback_data: string }>>,
    video?: string
  ) => Promise<boolean>
}

export interface GroupCardOffer {
  jobId: number
  owner: string
  chat: string
  groupTitle: string | null
  url: string
  caption: string
  name: string
  topic: string
  /** The video is not in this chat yet: attach it to the card. */
  withVideo: boolean
  /** To the client herself (her DM, the gift), not to a group. */
  dm?: boolean
}

export const storyTurn = (jobId: number): string =>
  `${SPEC.CARD_TURN_PREFIX}${jobId}`

/** The words on the card: what, where, who sees it, and the caption. */
export function groupCardText(o: GroupCardOffer): string {
  const where = o.groupTitle ? `«${o.groupTitle}»` : o.chat
  const who = o.name || 'клиента'
  const ask = o.dm
    ? `Отправить в личку как подарок? Уйдёт от вашего имени.`
    : `Отправить в группу ${where}? Уйдёт от вашего имени, увидят все участники.`
  const text =
    `🎬 Рилс-история для ${who} готова: «${o.topic}».\n\n` +
    `${ask}\n\nПодпись:\n${o.caption}`
  return text.slice(0, SPEC.CARD_TEXT_MAX)
}

/** The same two buttons as every card (the bot's tgp:ok / tgp:no handlers). */
export function cardButtons(id: string, secret: string, dm = false) {
  const send = dm ? '✅ Отправить' : '✅ Отправить в группу'
  return [
    [
      { text: send, callback_data: `tgp:ok:${id}:${secret}` },
      { text: '✖️ Отмена', callback_data: `tgp:no:${id}:${secret}` },
    ],
  ]
}

/** The caption the group reads, when the seller did not write one. */
export function defaultGroupCaption(
  name: string,
  topic: string,
  page: string
): string {
  const to = name ? `${name}, это` : 'Это' // cyrillic-ok: user-facing copy
  return (
    `${to} ваш рилс-история «${topic}»: ваше лицо и ваш голос.` + // cyrillic-ok: user-facing copy
    (page
      ? `\n\nСледующий рилс — на любую тему, здесь: ${page}` // cyrillic-ok: user-facing copy
      : '')
  )
}

export async function offerGroupCard(
  port: CardPort,
  o: GroupCardOffer
): Promise<CardOutcome> {
  if (!port.queueFree(o.owner)) return 'busy'
  const turn = storyTurn(o.jobId)
  const made = await port
    .draft(o.owner, turn, { chat: o.chat, url: o.url, caption: o.caption })
    .catch(() => null)
  if (!made?.id) return 'failed'
  const issued = port.issue(o.owner, turn)
  if (!issued || issued.id !== made.id) return 'failed'
  const posted = await port
    .post(
      o.owner,
      groupCardText(o),
      cardButtons(issued.id, issued.secret, o.dm === true),
      o.withVideo ? o.url : undefined
    )
    .catch(() => false)
  return posted ? 'shown' : 'failed'
}
