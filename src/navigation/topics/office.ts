/**
 * THE NEURO-OFFICE: LIVE PEOPLE AND THE TEAM OF AGENTS IN ONE GROUP.
 *
 * Spec of record: bot-neuro-office.t27 (gHashTag/t27#7884). Owner,
 * 2026-10-08: "the team members must be in these channels -- that is the
 * point of the neuro-office -- live people and agents". A private chat holds
 * one person, so the office is a forum group: `/office` makes the whole
 * team's channels there (the same tab engine, keyed by the group), people
 * talk to each other freely, and an agent answers only when spoken to -- a
 * reply, `@bot`, a command (groupAddressing.ts) -- or, in an office and
 * nowhere else, when a message opens with a member's name ("Казначей, ...").
 *
 * A channel speaks as its member (channel_speaker); the render reads the
 * member and gives the turn its trade (profession.ts), so a guest named in
 * another member's channel answers there under its own name. A room carries
 * no pay buttons (pay_buttons_in): a top-up is one person's.
 *
 * The numbers come from the spec's t27c gen-ts output; each rule is written
 * once here and src/spec/bot-neuro-office.test.ts runs every test of the
 * spec against it.
 */
import type { Telegraf } from 'telegraf'
import * as OFFICE from '@/spec/bot-neuro-office.gen'
import * as TABS_SPEC from '@/spec/bot-topic-tabs.gen'
import * as TEAM from '@/spec/bot-agent-team.gen'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { ensureTabs, knownTabs, TABS } from './tabs'
import { addressed } from './team'

/** spec may_open_office: a forum, the bot managing topics, an admin asking. */
export function mayOpenOffice(
  isForum: boolean,
  botManagesTopics: boolean,
  senderIsAdmin: boolean
): boolean {
  return isForum && botManagesTopics && senderIsAdmin
}

/** spec answers: spoken to, or (in an office only) named first. */
export function answersInRoom(
  replyToBot: boolean,
  mentioned: boolean,
  command: boolean,
  office: boolean,
  memberNamedFirst: boolean
): boolean {
  return replyToBot || mentioned || command || (office && memberNamedFirst)
}

/** spec channel_speaker: the channel's member, or the Agent (0). */
export function channelSpeaker(channelKnown: boolean, channel: number): number {
  return channelKnown ? channel : 0
}

/** spec pay_buttons_in: no pay buttons in a room (ROOM_PAY_BUTTONS). */
export function payButtonsIn(room: boolean): boolean {
  return !room || OFFICE.ROOM_PAY_BUTTONS
}

/** spec hears (v2): in an office, a person's line nobody addressed to the agent. */
export function hears(
  office: boolean,
  addressed: boolean,
  fromBot: boolean,
  isCommand: boolean
): boolean {
  return OFFICE.HEARS_PEOPLE && office && !addressed && !fromBot && !isCommand
}

/** spec heard_chars (v2): a heard line is kept up to HEARD_MAX_CHARS. */
export function heardChars(chars: number): number {
  return chars > OFFICE.HEARD_MAX_CHARS ? OFFICE.HEARD_MAX_CHARS : chars
}

/** spec names_speaker (v2): a person's line in a room names who said it. */
export function namesSpeaker(room: boolean): boolean {
  return room && OFFICE.ROOM_LINE_NAMES_SPEAKER
}

/** spec speaker_chars (v2): a name is cut to SPEAKER_NAME_MAX_CHARS. */
export function speakerChars(chars: number): number {
  return chars > OFFICE.SPEAKER_NAME_MAX_CHARS
    ? OFFICE.SPEAKER_NAME_MAX_CHARS
    : chars
}

/**
 * A person's name as the room knows it: first and last name, or @username,
 * on one line and cut to the spec's bound.
 */
export function speakerName(from: any): string {
  const full = [from?.first_name, from?.last_name]
    .filter(p => typeof p === 'string' && p.trim())
    .join(' ')
  const name =
    full.replace(/\s+/g, ' ').trim() ||
    (from?.username ? `@${from.username}` : String(from?.id ?? ''))
  const chars = [...name]
  return chars.slice(0, speakerChars(chars.length)).join('')
}

/** spec may_catch_up (v3): /catchup is answered in an office only. */
export function mayCatchUp(office: boolean): boolean {
  return office || !OFFICE.CATCHUP_ONLY_IN_OFFICE
}

/**
 * What a catch-up names, in the spec's order (CATCHUP_PARTS): what was
 * decided, what is still open, who took what on. Interface text only.
 */
export const CATCHUP_PARTS_TEXT: ReadonlyArray<{ ru: string; en: string }> = [
  { ru: 'что решили', en: 'what was decided' },
  { ru: 'что осталось открытым', en: 'what is still open' },
  { ru: 'кто что взял на себя (по именам)', en: 'who took what on, by name' },
]

/** The turn /catchup asks the agent, in the person's language. */
export function catchupAsk(isRu: boolean): string {
  const parts = CATCHUP_PARTS_TEXT.map(
    (p, i) => `${i + 1}) ${isRu ? p.ru : p.en}`
  ).join('; ')
  return isRu
    ? `Я был(а) не здесь. Коротко по памяти этой комнаты: ${parts}. Только то, что люди здесь сказали; чего не было — так и скажи.`
    : `I was away. Briefly, from this room's memory: ${parts}. Only what people here said; if something was not said, say so.`
}

/** The line as the room's memory keeps it: "Anna: ..." in a room, as is elsewhere. */
export function speakerLine(from: any, text: string, room: boolean): string {
  const name = speakerName(from)
  return namesSpeaker(room) && name ? `${name}: ${text}` : text
}

/**
 * The words a person calls each member by (interface text), lower case. The
 * render keeps the same list (profession.ts MEMBER_NAMES);
 * src/__tests__/navigation/officeNamesParity.test.ts holds them equal.
 */
export const MEMBER_NAMES: Record<string, readonly string[]> = {
  agent: ['агент', 'agent'], // cyrillic-ok: names people type
  reels: ['режиссёр', 'режиссер', 'director'], // cyrillic-ok: names people type
  browser: ['штурман', 'navigator'], // cyrillic-ok: names people type
  mybot: ['конструктор', 'builder'], // cyrillic-ok: names people type
  wallet: ['казначей', 'treasurer'], // cyrillic-ok: names people type
  hive: ['королева', 'queen'], // cyrillic-ok: names people type
}

/** The member a message opens with, or TEAM_SIZE when it names nobody first. */
export function memberNamedFirst(text: string | null | undefined): number {
  const first = String(text ?? '')
    .trimStart()
    .replace(/^@/, '')
    .toLowerCase()
    .match(/^\p{L}+/u)?.[0]
  if (!first) return TEAM.TEAM_SIZE
  const i = (TABS_SPEC.TAB_KEYS as readonly string[]).findIndex(kind =>
    addressed(true, (MEMBER_NAMES[kind] ?? []).includes(first))
  )
  return i < 0 ? TEAM.TEAM_SIZE : i
}

const isRoom = (ctx: any): boolean =>
  ctx?.chat?.type === 'group' || ctx?.chat?.type === 'supergroup'

/** The office's channels in this group: its stored tabs, or none. */
async function officeRows(ctx: any) {
  const bot = String(ctx?.botInfo?.username ?? '')
  if (!bot || !isRoom(ctx)) return []
  try {
    return ((await knownTabs(bot, Number(ctx.chat.id))) ?? []).filter(
      r => r.thread_id > 0
    )
  } catch {
    return []
  }
}

/**
 * The office rule on top of the room rule: in a group that is an office, a
 * message that opens with a member's name is spoken to that member. The
 * other signals (reply, @bot, command) stay groupAddressing.ts's.
 */
export async function namedInOffice(ctx: any): Promise<boolean> {
  if (!isRoom(ctx)) return false
  const text = ctx.message?.text ?? ctx.message?.caption
  const named = memberNamedFirst(text) < TEAM.TEAM_SIZE
  if (!named) return false
  const office = (await officeRows(ctx)).length > 0
  return answersInRoom(false, false, false, office, named)
}

/**
 * The member this group channel speaks as (its tab kind), or undefined
 * outside the office's channels. The render makes a member named first a
 * guest in this channel (bot-agent-team.t27 speaker).
 */
export async function officeChannelKind(ctx: any): Promise<string | undefined> {
  const thread = Number(ctx?.message?.message_thread_id)
  const rows = await officeRows(ctx)
  const row = rows.find(r => r.thread_id === thread)
  const index = row
    ? (TABS_SPEC.TAB_KEYS as readonly string[]).indexOf(row.kind)
    : -1
  const speaker = channelSpeaker(index >= 0, Math.max(index, 0))
  return rows.length ? TABS_SPEC.TAB_KEYS[speaker] : undefined
}

/**
 * THE OFFICE HEARS THE ROOM (spec v2, issue #3897). A person's line nobody
 * addressed to the agent goes into the room's memory, named after its
 * speaker, and is never answered: a turn asked later then knows what people
 * said to each other ("Director, do what Anna said"). Only in an office: a
 * plain group the bot sits in is not heard. Never throws, never replies.
 */
export async function hearInOffice(
  ctx: any,
  record: (
    telegramId: string,
    turns: Array<{ role: 'user' | 'assistant'; content: string }>,
    surface: 'bot',
    where: { room: string }
  ) => Promise<unknown>
): Promise<boolean> {
  try {
    if (!isRoom(ctx) || !ctx.from) return false
    const raw = ctx.message?.text ?? ctx.message?.caption
    if (typeof raw !== 'string' || !raw.trim()) return false
    const isCommand = raw.trimStart().startsWith('/')
    const fromBot = ctx.from.is_bot === true
    // The cheap refusals first: a bot or a command costs no database read.
    if (fromBot || isCommand) return false
    const office = (await officeRows(ctx)).length > 0
    if (!hears(office, false, fromBot, isCommand)) return false
    const chars = [...raw.trim()]
    const text = chars.slice(0, heardChars(chars.length)).join('')
    await record(
      String(ctx.from.id),
      [{ role: 'user', content: speakerLine(ctx.from, text, true) }],
      'bot',
      { room: String(ctx.chat.id) }
    )
    return true
  } catch (e) {
    logger.warn('[office] line not heard', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    return false
  }
}

/**
 * /catchup (spec v3, issue #3899): a person back in the office asks what was
 * said and decided; the agent answers from the room's memory. Asked as that
 * person, in the room, from the channel's member. Elsewhere it says where it
 * works and asks the agent nothing. Never throws.
 */
export async function catchUp(
  ctx: any,
  ask: (
    telegramId: string,
    text: string,
    opts: { room: string; member?: string; speaker?: string }
  ) => Promise<{ текст: string }> // cyrillic-ok: pre-existing field of the agent answer
): Promise<'answered' | 'not an office' | 'failed'> {
  const isRu = isRussianFromState(ctx as any)
  const office = isRoom(ctx) && (await officeRows(ctx)).length > 0
  if (!mayCatchUp(office)) {
    await ctx
      .reply(
        isRu
          ? 'Сводка работает в нейроофисе: в группе с темами после /office.'
          : 'The catch-up works in a neuro-office: a group with topics after /office.'
      )
      .catch(() => undefined)
    return 'not an office'
  }
  try {
    const member = await officeChannelKind(ctx)
    const answer = await ask(String(ctx.from?.id ?? ''), catchupAsk(isRu), {
      room: String(ctx.chat.id),
      ...(member ? { member } : {}),
      ...(ctx.from ? { speaker: speakerName(ctx.from) } : {}),
    })
    const { разбитьДлинное } = await import('@/helpers/telegramLongAnswer') // cyrillic-ok: pre-existing export
    const chunks = разбитьДлинное(answer?.текст ?? '') // cyrillic-ok: pre-existing identifiers
    if (!chunks.length) throw new Error('empty answer')
    for (const chunk of chunks) await ctx.reply(chunk)
    return 'answered'
  } catch (e) {
    logger.warn('[office] catch-up failed', {
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    })
    await ctx
      .reply(
        isRu
          ? 'Сводку сейчас собрать не вышло. Попробуйте /catchup через минуту.'
          : 'The catch-up did not come together. Try /catchup in a minute.'
      )
      .catch(() => undefined)
    return 'failed'
  }
}

/** /office: make this forum group the team's office. */
export function registerOfficeCommand(bot: Telegraf<any>): void {
  bot.command('catchup', async ctx => {
    const { спроситьАгента } = await import('@/services/trinityAgent') // cyrillic-ok: pre-existing export
    await catchUp(ctx, (id, text, opts) => спроситьАгента(id, text, opts)) // cyrillic-ok: pre-existing export
  })
  bot.command('office', async ctx => {
    const isRu = isRussianFromState(ctx as any)
    if (!isRoom(ctx)) {
      await ctx.reply(
        isRu
          ? 'Нейроофис открывается в группе: создайте группу с темами, добавьте меня админом и пришлите /office там.'
          : 'The neuro-office opens in a group: make a group with topics, add me as an admin and send /office there.'
      )
      return
    }
    const chat: any = ctx.chat
    let botManages = false
    let senderAdmin = false
    try {
      const me: any = await ctx.telegram.getChatMember(chat.id, ctx.botInfo.id)
      botManages =
        me?.status === 'creator' ||
        (me?.status === 'administrator' && me?.can_manage_topics === true)
      const them: any = await ctx.telegram.getChatMember(chat.id, ctx.from!.id)
      senderAdmin =
        them?.status === 'creator' || them?.status === 'administrator'
    } catch (e) {
      logger.warn('[office] member check failed', {
        error: e instanceof Error ? e.message.slice(0, 120) : String(e),
      })
    }
    const isForum = chat?.is_forum === true
    if (!mayOpenOffice(isForum, botManages, senderAdmin)) {
      const missing = [
        !isForum &&
          (isRu
            ? 'включите темы в настройках группы'
            : 'turn on Topics in the group settings'),
        !botManages &&
          (isRu
            ? 'сделайте меня админом с правом управлять темами'
            : 'make me an admin who may manage topics'),
        !senderAdmin &&
          (isRu
            ? 'команду присылает админ группы'
            : 'an admin of the group sends the command'),
      ].filter(Boolean)
      await ctx.reply(
        (isRu
          ? 'Нейроофис пока не открыть: '
          : 'The neuro-office cannot open yet: ') +
          missing.join('; ') +
          '.'
      )
      return
    }
    const made = await ensureTabs(
      ctx.telegram as any,
      String(ctx.botInfo.username),
      Number(chat.id),
      isRu,
      () => undefined
    )
    const names = TABS.map(t => (isRu ? t.ru : t.en)).join(', ')
    await ctx.reply(
      isRu
        ? `Нейроофис открыт (${made.length} новых каналов). В команде: ${names}.\nЛюди говорят свободно. Агента зовите по имени первым словом («Казначей, …»), через @${ctx.botInfo.username} или ответом на его сообщение.`
        : `The neuro-office is open (${made.length} new channels). The team: ${names}.\nPeople talk freely. Call an agent by its name first ("Treasurer, ..."), by @${ctx.botInfo.username} or by replying to its message.`
    )
  })
}
