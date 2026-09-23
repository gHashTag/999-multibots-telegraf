/**
 * THE MAIN MINI APP OF ONE FARM BOT, SWITCHED ON IN @BotFather FROM THE
 * ACCOUNT THAT OWNS THAT BOT.
 *
 * Owner, 2026-09-22: every link to our app must open inside Telegram, and --
 * asked whether to do it through his account -- "yes, configure it through my
 * account". A link of the form https://t.me/<bot>?startapp=<route> opens the
 * app in one tap only when the bot has a MAIN Mini App, and that switch has
 * no Bot API method: it lives in @BotFather, behind inline buttons
 * (/mybots -> the bot -> Bot Settings -> Configure Mini App -> Enable Mini App
 * -> the URL). Measured the same day: getMe.has_main_web_app was false for
 * the farm bots that were checked.
 *
 * ── WHY IT RUNS INSIDE THE RENDER, AND ONLY HERE ────────────────────────────
 *
 * The Telegram sessions live in this process (tg_sessions, or the
 * TELEGRAM_SESSION_STRING fallback for the platform owner, opened by
 * `client()` in telegram-tools). The same auth key used from a second process
 * risks AUTH_KEY_DUPLICATED, which logs that person out everywhere. So the
 * BotFather conversation is driven with the render's own client, by
 * `withClient`, like every other tg_* tool. No session is ever handed out.
 *
 * ── WHOSE /mybots ───────────────────────────────────────────────────────────
 *
 * @BotFather shows a bot only to the account that CREATED it. Measured
 * 2026-09-22: of eleven farm bots only two are in the platform owner's
 * /mybots; the rest were created by clients. Run through the owner's session
 * alone, this tool could therefore configure two bots out of eleven -- and
 * for the other nine it stopped with "not in the list /mybots shows", which
 * is true and useless.
 *
 * So `as` names the account the BotFather dialogue runs through. The gate is
 * the one `crm_duet` already uses for acting through somebody else's session,
 * and it has two halves that must BOTH hold:
 *
 *   * the holder connected that account THEMSELVES -- a row in tg_sessions,
 *     read by `isSeller`, the same check and the same table the login screen
 *     writes. A session is never opened for an account that did not connect.
 *   * the platform owner authorises THIS run -- `authorized_by_owner: true`,
 *     an argument that must be typed, so the `as` form cannot be reached by
 *     defaulting or by a forgotten field.
 *
 * Calling stays owner-only either way: `as` widens whose account acts, never
 * who may ask. One line is logged naming the acting account and the bot, so a
 * run through somebody else's Telegram is never silent.
 *
 * ── WHY IT IS DETERMINISTIC ────────────────────────────────────────────────
 *
 * No model reads BotFather's replies and decides what to press. The driver
 * below knows the path in advance: each step names the labels it accepts
 * (exact, after trimming emoji and case), a timeout, and what the next screen
 * must contain. Anything else -- a missing button, two buttons that both
 * match, a reply it does not recognise, a step that takes too long -- STOPS
 * the run and returns what BotFather said and where it stopped. A person
 * reads the transcript and decides; the code never guesses.
 *
 * ── WHO MAY CALL IT ─────────────────────────────────────────────────────────
 *
 * The platform owner only (`requireOwner`, the gate every owner-only tool
 * uses), and only directly: the tool is in DIRECT_CALL_ONLY (tools.ts), so a
 * model turn that has read somebody else's words can neither see it nor call
 * it. Only bots of the farm -- the render's own tokens, matched by username
 * through getMe on the host each bot lives on -- and only a URL on our app's
 * host.
 */

import type { AgentTool, ToolContext } from './tools'
import { requireOwner, isSeller, withClient } from './telegram-tools'
import { tokenForBot, normaliseBotName } from './bot-farm'
import { telegramApiFor } from '../telegram-api'

/* ─────────────────────────── BotFather, as a port ─────────────────────────── */

export interface BotFatherButton {
  text: string
  /** Callback data; absent for a url / web-view button, which cannot be pressed here. */
  data?: Uint8Array
}

export interface BotFatherMessage {
  id: number
  text: string
  /** Seconds; set once BotFather has edited the message. */
  editDate?: number
  /** Every button of the inline keyboard, row after row. */
  buttons: BotFatherButton[]
}

/**
 * The three things the driver does to BotFather. The real one is
 * `gramBotFather` (the owner's gramjs client); the tests hand in a script.
 */
export interface BotFatherChat {
  send(text: string): Promise<void>
  /** BotFather's newest message (never one of ours), as it is NOW. */
  latest(): Promise<BotFatherMessage | null>
  press(messageId: number, data: Uint8Array): Promise<void>
}

/* ──────────────────────────── the path, as data ──────────────────────────── */

export type StepName =
  | 'open'
  | 'pick_bot'
  | 'bot_settings'
  | 'configure_mini_app'
  | 'enable_mini_app'
  | 'send_url'
  | 'confirm'
  | 'verify'

/**
 * The labels each press accepts, in order of preference, compared EXACTLY
 * after `labelKey`. Exact on purpose: "includes" would press the button of
 * a bot whose name merely contains the one asked for, and "Menu Button" is
 * one substring away from a mini-app button in some wording. The first
 * alternative that matches exactly one button wins; one that matches two
 * stops the run.
 */
export const STEP_LABELS = {
  bot_settings: ['bot settings', 'settings'],
  configure_mini_app: [
    'configure mini app',
    'configure main mini app',
    'main mini app',
    'mini app',
  ],
  enable_mini_app: [
    'enable mini app',
    'enable main mini app',
    'turn on',
    'turn on mini app',
    'enable',
  ],
  /** On the mini-app screen these mean the switch is already on. */
  already_on: [
    'disable mini app',
    'disable main mini app',
    'turn off',
    'turn off mini app',
    'disable',
    'edit mini app url',
    'edit mini app',
    'change mini app url',
  ],
} as const

/** How many pages of /mybots are turned before the bot counts as absent. */
export const MAX_PAGES = 5

/** BotFather asking for the address. Checked before the URL is ever sent. */
const ASKS_FOR_URL =
  /\b(send|enter|provide|type|paste)\b[^.!?\n]{0,60}\b(url|link|address)\b/i
/** A refusal wins over a success word in the same reply. */
const REPLY_FAILED =
  /\b(invalid|error|sorry|wrong|incorrect|not allowed|unsupported|failed|must be|must start|isn't|is not|can't|cannot|unable)\b/i
const REPLY_SUCCEEDED =
  /\b(success|successfully|enabled|updated|saved|done|is now|has been set|was set)\b/i

/** Hosts the Main Mini App may point at: our app, nothing else. */
export const APP_HOSTS: readonly string[] = [
  'app.t27.ai',
  'vibee-editor-production.up.railway.app',
]

export const DEFAULT_STEP_TIMEOUT_MS = 20_000
export const DEFAULT_POLL_MS = 800

/* ─────────────────────────────── pure helpers ─────────────────────────────── */

/** "⚙️ Bot Settings" -> "bot settings"; "@Example_Bot" -> "@example_bot". */
export function labelKey(label: string): string {
  return String(label ?? '')
    .normalize('NFKC')
    .replace(/^[^\p{L}\p{N}@]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

export type Pick =
  | { found: BotFatherButton }
  | { missing: true }
  | { ambiguous: string }

/** The button for the first accepted label that matches exactly one button. */
export function pickButton(
  buttons: BotFatherButton[],
  accepted: readonly string[]
): Pick {
  for (const want of accepted) {
    const hits = buttons.filter(b => labelKey(b.text) === want)
    if (hits.length === 1) return { found: hits[0] }
    if (hits.length > 1) return { ambiguous: want }
  }
  return { missing: true }
}

/** The bot's own button in the /mybots list: "@username", exactly. */
export function pickBotButton(
  buttons: BotFatherButton[],
  username: string
): Pick {
  const want = normaliseBotName(username)
  const hits = buttons.filter(b => labelKey(b.text).replace(/^@/, '') === want)
  if (hits.length === 1) return { found: hits[0] }
  if (hits.length > 1) return { ambiguous: want }
  return { missing: true }
}

/** "»", "›", "Next »" -- never a "« Back". */
export function isNextPage(label: string): boolean {
  const raw = String(label ?? '').trim()
  if (/back|«|‹|←/i.test(raw)) return false
  return /^(»|›|→|>>?|»»)$/.test(raw) || /^next\b/i.test(labelKey(raw))
}

/**
 * Every bot a text names by @username, lowercased, without the @. Only names
 * that end in "bot" count: every bot username does, and @BotFather does not.
 */
export function botsNamedIn(text: string): string[] {
  const out: string[] = []
  for (const m of String(text ?? '').matchAll(/@([A-Za-z0-9_]+)/g)) {
    const name = m[1].toLowerCase()
    if (name.endsWith('bot') && !out.includes(name)) out.push(name)
  }
  return out
}

/** The first bot other than `bot` that the text names, as "@name", or null. */
export function otherBotIn(text: string, bot: string): string | null {
  const own = normaliseBotName(bot)
  const other = botsNamedIn(text).find(n => n !== own)
  return other ? '@' + other : null
}

const TOKEN_SHAPED = /\d{5,}:[A-Za-z0-9_-]{20,}/g

/** BotFather's text as it may leave this module: no token, bounded. */
export function redact(text: string, limit = 400): string {
  const clean = String(text ?? '').replace(TOKEN_SHAPED, '<redacted>')
  return clean.length > limit ? clean.slice(0, limit) + '…' : clean
}

/** What makes two sightings of BotFather's screen the same screen. */
function signature(m: BotFatherMessage | null): string {
  if (!m) return ''
  return [
    m.id,
    m.editDate ?? 0,
    m.text,
    m.buttons.map(b => b.text).join(''),
  ].join('')
}

/**
 * Whitespace, control and format characters (zero-width, bidi). new URL()
 * silently DROPS \n and \t, so a check on the parsed URL would pass
 * "https://app.t27.ai/\nhttps://evil.example" while BotFather got both lines.
 */
const HIDDEN_IN_URL = /[\s\p{Cc}\p{Cf}]/u

/**
 * https, our host, no port, nothing hidden in it. Returns the address in the
 * one form that was checked -- `u.href` -- and that form is what BotFather
 * is sent, never the raw string.
 */
export function checkAppUrl(
  raw: unknown
): { href: string } | { problem: string } {
  const text = String(raw ?? '').trim()
  if (HIDDEN_IN_URL.test(text)) {
    return {
      problem:
        'в адресе не должно быть пробелов и невидимых или управляющих символов',
    }
  }
  let u: URL
  try {
    u = new URL(text)
  } catch {
    return { problem: 'это не адрес' }
  }
  if (u.protocol !== 'https:') {
    return { problem: 'адрес должен начинаться с https://' }
  }
  if (u.username || u.password) {
    return { problem: 'в адресе не должно быть логина' }
  }
  if (!APP_HOSTS.includes(u.hostname.toLowerCase())) {
    return {
      problem: `это не наше приложение (${u.hostname}); допустимы: ${APP_HOSTS.join(', ')}`,
    }
  }
  if (u.port !== '') return { problem: 'в адресе не должно быть порта' }
  return { href: u.href }
}

/** The reason a URL is refused, or null. */
export function appUrlProblem(raw: unknown): string | null {
  const c = checkAppUrl(raw)
  return 'problem' in c ? c.problem : null
}

/* ──────────────────────────────── the driver ──────────────────────────────── */

export interface StepRecord {
  step: StepName
  ok: boolean
  note?: string
}

export interface DriveResult {
  outcome: 'confirmed' | 'already_on' | 'stopped'
  steps: StepRecord[]
  transcript: string[]
  stoppedAt?: StepName
  reason?: string
  /** The labels on BotFather's screen where the run stopped. */
  lastButtons?: string[]
  urlSent: boolean
}

export interface DriveOptions {
  stepTimeoutMs?: number
  pollMs?: number
  log?: (line: string) => void
}

type Verdict = 'ok' | 'fail' | 'wait'
/** 'stray': the screen is about a bot other than the one being configured. */
type Outcome = 'ok' | 'fail' | 'stray'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** A BotFather call that had not returned when its step's time ran out. */
export class DeadlineError extends Error {}

/**
 * `p`, or a DeadlineError once `ms` have passed. The deadline cannot live in
 * the loop alone: a chat call that never returns would never reach the
 * check, the run would hang, the one-run lock would stay held and the
 * owner's client would never be hung up. A late call is abandoned, not
 * awaited; closing the client when the run returns settles it.
 */
export function withDeadline<T>(
  p: Promise<T>,
  ms: number,
  what: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeadlineError(`${what}: no answer in time`)),
      Math.max(0, ms)
    )
  })
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

/**
 * Walk BotFather's menus for ONE bot and hand it ONE url.
 *
 * Every step: act, then poll BotFather's newest message until it CHANGES
 * (a new message, or the same one edited) into what the step expects. A
 * change into anything else stops the run -- or, where BotFather is known
 * to edit a menu before posting the next message, keeps waiting until the
 * step's own timeout.
 */
export async function driveBotFather(
  chat: BotFatherChat,
  target: { username: string; url: string },
  o: DriveOptions = {}
): Promise<DriveResult> {
  const stepTimeoutMs = o.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS
  const pollMs = o.pollMs ?? DEFAULT_POLL_MS
  const log = o.log ?? ((line: string) => console.log(line))
  const bot = '@' + normaliseBotName(target.username)
  const checkedUrl = checkAppUrl(target.url)
  const steps: StepRecord[] = []
  const transcript: string[] = []
  const seen = new Set<string>()
  let urlSent = false
  let current: BotFatherMessage | null = null
  /**
   * Set when the bot's own button is pressed. From then on BotFather's
   * screens are only read by label, so a screen that names ANOTHER bot --
   * the owner tapping BotFather on another device, or sending /mybots there
   * -- must stop the run before a press or the URL follows it.
   */
  let bound = false

  const note = (m: BotFatherMessage | null) => {
    const s = signature(m)
    if (m && !seen.has(s)) {
      seen.add(s)
      transcript.push(redact(m.text))
    }
  }
  const record = (step: StepName, ok: boolean, why?: string) => {
    steps.push(why ? { step, ok, note: why } : { step, ok })
    log(
      `[botfather-main-app] ${bot} ${step} ${ok ? 'ok' : 'stop'}` +
        (why ? ` (${why})` : '')
    )
  }
  const stop = (step: StepName, reason: string): DriveResult => {
    record(step, false, reason)
    return {
      outcome: 'stopped',
      steps,
      transcript,
      stoppedAt: step,
      reason,
      lastButtons: current?.buttons.map(b => redact(b.text, 64)) ?? [],
      urlSent,
    }
  }

  /**
   * Poll until BotFather's newest message differs from `before` and is
   * judged. Null when the step's deadline passes -- including while a read
   * is still in flight.
   */
  const waitFor = async (
    before: string,
    judge: (m: BotFatherMessage) => Verdict,
    deadline = Date.now() + stepTimeoutMs
  ): Promise<{ m: BotFatherMessage; v: Outcome } | null> => {
    for (;;) {
      let m: BotFatherMessage | null
      try {
        m = await withDeadline(
          chat.latest(),
          deadline - Date.now(),
          'reading BotFather'
        )
      } catch (e) {
        if (e instanceof DeadlineError) return null
        throw e
      }
      if (m && signature(m) !== before) {
        note(m)
        current = m
        if (bound && otherBotIn(m.text, bot)) return { m, v: 'stray' }
        const v = judge(m)
        if (v !== 'wait') return { m, v }
      }
      if (Date.now() >= deadline) return null
      await sleep(pollMs)
    }
  }

  /** Press a callback button on the current screen and wait for the next one. */
  const press = async (
    button: BotFatherButton,
    judge: (m: BotFatherMessage) => Verdict
  ) => {
    const before = signature(current)
    // One deadline for the whole step: the press and the wait after it.
    const deadline = Date.now() + stepTimeoutMs
    let pressError: string | undefined
    try {
      await withDeadline(
        chat.press(current!.id, button.data!),
        stepTimeoutMs,
        'pressing the button'
      )
    } catch (e) {
      // BotFather may be slow to answer the callback and still edit the
      // screen; only a screen that never changes makes this a stop.
      pressError = redact(String((e as Error)?.message ?? e), 120)
    }
    const r = await waitFor(before, judge, deadline)
    return { r, pressError }
  }

  const pressable = (b: BotFatherButton) =>
    b.data instanceof Uint8Array && b.data.length > 0

  const strayed = (step: StepName, m: BotFatherMessage) =>
    stop(
      step,
      `BotFather's screen is about ${otherBotIn(m.text, bot)}, not ${bot}; ` +
        'BotFather may be in use on another device'
    )

  // Checked before anything reaches BotFather; the driver is exported, so
  // it does not trust its caller to have checked.
  if ('problem' in checkedUrl) {
    return stop('send_url', `the URL is refused: ${checkedUrl.problem}`)
  }
  const sendUrl = checkedUrl.href

  // ── open: /mybots ──
  const openBy = Date.now() + stepTimeoutMs
  let initial: BotFatherMessage | null
  try {
    initial = await withDeadline(
      chat.latest(),
      stepTimeoutMs,
      'reading BotFather'
    )
    current = initial
    await withDeadline(
      chat.send('/mybots'),
      openBy - Date.now(),
      'sending /mybots'
    )
  } catch (e) {
    if (e instanceof DeadlineError) return stop('open', e.message)
    throw e
  }
  const hasBotOrNext = (m: BotFatherMessage): Verdict =>
    'found' in pickBotButton(m.buttons, bot) ||
    m.buttons.some(b => isNextPage(b.text))
      ? 'ok'
      : 'fail'
  const opened = await waitFor(signature(initial), hasBotOrNext, openBy)
  if (!opened) return stop('open', 'BotFather did not answer /mybots in time')
  if (opened.v === 'fail') {
    return stop('open', `${bot} is not in the list /mybots shows`)
  }
  record('open', true)

  // ── pick_bot, turning pages when the bot is not on this one ──
  for (let page = 1; ; page += 1) {
    const pick = pickBotButton(current!.buttons, bot)
    if ('ambiguous' in pick) {
      return stop('pick_bot', `more than one button reads ${bot}`)
    }
    if ('found' in pick) {
      if (!pressable(pick.found)) {
        return stop('pick_bot', `the ${bot} button cannot be pressed`)
      }
      bound = true
      const { r, pressError } = await press(pick.found, m =>
        'found' in pickButton(m.buttons, STEP_LABELS.bot_settings)
          ? 'ok'
          : 'fail'
      )
      if (!r) {
        return stop(
          'pick_bot',
          'BotFather did not open the bot in time' +
            (pressError ? `: ${pressError}` : '')
        )
      }
      if (r.v === 'stray') return strayed('pick_bot', r.m)
      if (r.v === 'fail') {
        return stop(
          'bot_settings',
          'no "Bot Settings" button on the bot screen'
        )
      }
      record('pick_bot', true)
      break
    }
    const next = current!.buttons.find(b => isNextPage(b.text))
    if (!next || page >= MAX_PAGES || !pressable(next)) {
      return stop('pick_bot', `${bot} is not in the list /mybots shows`)
    }
    const { r } = await press(next, () => 'ok')
    if (!r) return stop('pick_bot', 'the next page of /mybots did not open')
  }

  // ── bot_settings -> configure_mini_app ──
  const settings = pickButton(current!.buttons, STEP_LABELS.bot_settings)
  if (!('found' in settings) || !pressable(settings.found)) {
    return stop('bot_settings', 'the "Bot Settings" button cannot be pressed')
  }
  {
    const { r, pressError } = await press(settings.found, m =>
      'found' in pickButton(m.buttons, STEP_LABELS.configure_mini_app)
        ? 'ok'
        : 'fail'
    )
    if (!r) {
      return stop(
        'bot_settings',
        'BotFather did not open Bot Settings in time' +
          (pressError ? `: ${pressError}` : '')
      )
    }
    if (r.v === 'stray') return strayed('bot_settings', r.m)
    if (r.v === 'fail') {
      const ambiguous =
        'ambiguous' in pickButton(r.m.buttons, STEP_LABELS.configure_mini_app)
      return stop(
        'configure_mini_app',
        ambiguous
          ? 'more than one Mini App button on Bot Settings'
          : 'no "Configure Mini App" button on Bot Settings'
      )
    }
    record('bot_settings', true)
  }

  // ── configure_mini_app -> the switch, or already on ──
  const configure = pickButton(current!.buttons, STEP_LABELS.configure_mini_app)
  if (!('found' in configure) || !pressable(configure.found)) {
    return stop(
      'configure_mini_app',
      'the "Configure Mini App" button cannot be pressed'
    )
  }
  {
    const { r, pressError } = await press(configure.found, m =>
      'found' in pickButton(m.buttons, STEP_LABELS.enable_mini_app) ||
      'found' in pickButton(m.buttons, STEP_LABELS.already_on)
        ? 'ok'
        : 'fail'
    )
    if (!r) {
      return stop(
        'configure_mini_app',
        'BotFather did not open the Mini App screen in time' +
          (pressError ? `: ${pressError}` : '')
      )
    }
    if (r.v === 'stray') return strayed('configure_mini_app', r.m)
    if (r.v === 'fail') {
      return stop(
        'enable_mini_app',
        'the Mini App screen has neither an enable nor a disable button'
      )
    }
    record('configure_mini_app', true)
  }
  const ownName = (text: string) =>
    botsNamedIn(text).includes(normaliseBotName(bot))
  const namedOnMiniApp = ownName(current!.text)

  const enable = pickButton(current!.buttons, STEP_LABELS.enable_mini_app)
  if (!('found' in enable)) {
    record('enable_mini_app', true, 'already on')
    return { outcome: 'already_on', steps, transcript, urlSent }
  }
  if (!pressable(enable.found)) {
    return stop('enable_mini_app', 'the enable button cannot be pressed')
  }
  {
    // BotFather may edit the menu first and ask for the URL in a new
    // message after it, so a screen that does not ask yet is waited on.
    const { r, pressError } = await press(enable.found, m =>
      ASKS_FOR_URL.test(m.text) ? 'ok' : 'wait'
    )
    if (r?.v === 'stray') return strayed('send_url', r.m)
    // Only a screen that ASKS earns the URL; anything else is a stop.
    if (!r || r.v !== 'ok') {
      return stop(
        'send_url',
        'BotFather did not ask for the URL' +
          (pressError ? `: ${pressError}` : '')
      )
    }
    // The URL goes out only when BotFather has said, on the Mini App
    // screen or in the question itself, which bot it is for.
    if (!namedOnMiniApp && !ownName(r.m.text)) {
      return stop(
        'send_url',
        `neither the Mini App screen nor BotFather's question names ${bot}`
      )
    }
    record('enable_mini_app', true)
  }

  // ── send_url -> confirm ──
  const beforeUrl = signature(current)
  const confirmBy = Date.now() + stepTimeoutMs
  try {
    await withDeadline(chat.send(sendUrl), stepTimeoutMs, 'sending the URL')
  } catch (e) {
    if (!(e instanceof DeadlineError)) throw e
    // Nobody knows whether it went out; reported as sent, never as not.
    urlSent = true
    return stop('send_url', `${e.message}; it may have reached BotFather`)
  }
  urlSent = true
  record('send_url', true)
  const reply = await waitFor(
    beforeUrl,
    m =>
      REPLY_FAILED.test(m.text)
        ? 'fail'
        : REPLY_SUCCEEDED.test(m.text)
          ? 'ok'
          : 'wait',
    confirmBy
  )
  if (!reply) return stop('confirm', 'no reply BotFather is known to give')
  if (reply.v === 'stray') return strayed('confirm', reply.m)
  if (reply.v === 'fail') return stop('confirm', 'BotFather refused the URL')
  record('confirm', true)
  return { outcome: 'confirmed', steps, transcript, urlSent }
}

/* ──────────────────────────── the real BotFather ──────────────────────────── */

/** The slice of a gramjs client this module touches. */
export interface GramLike {
  sendMessage: (peer: string, o: { message: string }) => Promise<unknown>
  getMessages: (peer: string, o: { limit: number }) => Promise<unknown[]>
  invoke: (request: unknown) => Promise<unknown>
}

interface GramMessage {
  id?: number
  out?: boolean
  message?: string
  editDate?: number
  replyMarkup?: {
    className?: string
    rows?: Array<{
      buttons?: Array<{ className?: string; text?: string; data?: Uint8Array }>
    }>
  }
}

export const BOTFATHER = 'BotFather'

/** One gramjs message as the driver reads it. Only callback buttons carry data. */
export function fromGram(m: GramMessage): BotFatherMessage {
  const rows =
    m.replyMarkup?.className === 'ReplyInlineMarkup'
      ? (m.replyMarkup.rows ?? [])
      : []
  const buttons: BotFatherButton[] = []
  for (const row of rows) {
    for (const b of row.buttons ?? []) {
      buttons.push(
        b.className === 'KeyboardButtonCallback' && b.data
          ? { text: String(b.text ?? ''), data: b.data }
          : { text: String(b.text ?? '') }
      )
    }
  }
  return {
    id: Number(m.id ?? 0),
    text: String(m.message ?? ''),
    ...(m.editDate ? { editDate: m.editDate } : {}),
    buttons,
  }
}

/** BotFather through the owner's gramjs client. */
export function gramBotFather(c: GramLike): BotFatherChat {
  return {
    async send(text) {
      await c.sendMessage(BOTFATHER, { message: text })
    },
    async latest() {
      // Newest first; our own messages (the URL, /mybots) are skipped.
      const list = (await c.getMessages(BOTFATHER, { limit: 6 })) ?? []
      for (const raw of list) {
        const m = raw as GramMessage
        if (m && !m.out) return fromGram(m)
      }
      return null
    },
    async press(messageId, data) {
      const { Api } = await import('telegram')
      await c.invoke(
        new Api.messages.GetBotCallbackAnswer({
          peer: BOTFATHER,
          msgId: messageId,
          data: Buffer.from(data),
        })
      )
    },
  }
}

/* ───────────────────────────── the Bot API side ───────────────────────────── */

type Fetch = typeof fetch

interface Me {
  username: string
  hasMainWebApp: boolean | null
}

/** getMe on the host this bot lives on. The token never reaches an error. */
export async function getMe(token: string, fetchImpl: Fetch): Promise<Me> {
  let d: {
    ok?: boolean
    result?: { username?: unknown; has_main_web_app?: unknown }
  }
  try {
    const r = await fetchImpl(`${telegramApiFor(token)}/getMe`)
    d = (await r.json()) as typeof d
  } catch (e) {
    throw new Error(
      'getMe не ответил: ' + redact(String((e as Error)?.message ?? e), 120)
    )
  }
  if (!d?.ok) throw new Error('getMe отказал')
  const flag = d.result?.has_main_web_app
  return {
    username: normaliseBotName(String(d.result?.username ?? '')),
    hasMainWebApp: typeof flag === 'boolean' ? flag : null,
  }
}

/** The web_app URL of the bot's default menu button, or null. */
export async function menuButtonUrl(
  token: string,
  fetchImpl: Fetch
): Promise<string | null> {
  try {
    const r = await fetchImpl(`${telegramApiFor(token)}/getChatMenuButton`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    const d = (await r.json()) as {
      ok?: boolean
      result?: { type?: string; web_app?: { url?: unknown } }
    }
    if (!d?.ok || d.result?.type !== 'web_app') return null
    const url = String(d.result.web_app?.url ?? '').trim()
    return url || null
  } catch {
    return null
  }
}

/* ────────────────────────────── the capability ────────────────────────────── */

export interface MainAppArgs {
  bot?: unknown
  url?: unknown
  dry_run?: unknown
  as?: unknown
  authorized_by_owner?: unknown
}

export interface MainAppDeps {
  fetchImpl?: Fetch
  /**
   * Opens the acting account's BotFather chat for the length of `fn`. The
   * context it is handed is the one whose session must be used -- the
   * caller's, or the `as` account's.
   */
  openChat?: <T>(
    ctx: ToolContext,
    fn: (chat: BotFatherChat) => Promise<T>
  ) => Promise<T>
  stepTimeoutMs?: number
  pollMs?: number
  log?: (line: string) => void
}

export interface MainAppResult {
  bot: string
  status: 'dry_run' | 'already_on' | 'enabled' | 'unverified' | 'stopped'
  /** The account whose session drove BotFather; only on the `as` form. */
  acting_as?: string
  url?: string
  url_source?: 'argument' | 'menu_button'
  has_main_web_app: boolean | null
  dry_run?: true
  plan?: string[]
  steps?: StepRecord[]
  stopped_at?: StepName
  reason?: string
  transcript?: string[]
  last_buttons?: string[]
  url_sent?: boolean
}

const BOT_USERNAME = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/

/** The steps a run will take, from the same table the driver presses by. */
export function planFor(bot: string, url: string): string[] {
  const q = (xs: readonly string[]) => xs.map(x => `"${x}"`).join(' | ')
  return [
    `open: send "/mybots" to @${BOTFATHER}`,
    `pick_bot: press "${bot}" (turning "»" pages, at most ${MAX_PAGES})`,
    `bot_settings: press ${q(STEP_LABELS.bot_settings)}`,
    `configure_mini_app: press ${q(STEP_LABELS.configure_mini_app)}`,
    `enable_mini_app: press ${q(STEP_LABELS.enable_mini_app)}; ${q(STEP_LABELS.already_on)} means already on`,
    `send_url: when BotFather asks for it, send ${url}`,
    'confirm: wait for BotFather to confirm; a refusal stops the run',
    'verify: getMe must say has_main_web_app = true',
  ]
}

/** One run at a time: BotFather keeps one conversation state per account. */
let running: string | null = null

const TELEGRAM_ID = /^\d{5,15}$/

/**
 * WHOSE SESSION DRIVES BOTFATHER, AND ON WHAT AUTHORITY.
 *
 * Without `as`: the caller's own context, unchanged -- what this tool did
 * before, and the only form the platform owner needs for the bots they
 * created themselves.
 *
 * With `as`: a context that differs from the caller's in ONE field, the
 * telegram id, so `client()` looks the session up for that account and for
 * nobody else. Nothing else about the caller is dropped -- the pool is the
 * render's own, and the session read is the render's own.
 *
 * Both halves of the gate are checked here, before anything is asked of
 * Telegram, and each refusal says which half failed: "no session" is fixed by
 * the account's holder in the app, "not authorised" by the owner typing the
 * argument. A single vague refusal would send the owner to the wrong one.
 *
 * The confirmation is required whenever the argument is PRESENT, even when it
 * names the caller: it is about the form, not about who is named, and a rule
 * with an exception is a rule somebody will find the exception in.
 */
export async function actingAccount(
  args: MainAppArgs,
  ctx: ToolContext,
  hasSession: (c: ToolContext) => Promise<boolean> = isSeller
): Promise<{ ctx: ToolContext; as?: string }> {
  const raw = args?.as == null ? '' : String(args.as).trim()
  if (!raw) return { ctx }
  if (!TELEGRAM_ID.test(raw)) {
    throw new Error(
      'as: нужен числовой Telegram ID аккаунта, от имени которого вести @BotFather'
    )
  }
  if (args?.authorized_by_owner !== true) {
    throw new Error(
      `as=${raw}: чужой аккаунт ведётся только с вашего подтверждения — ` +
        'передайте authorized_by_owner=true'
    )
  }
  const acting = { ...ctx, telegramId: raw } as ToolContext
  if (!(await hasSession(acting))) {
    throw new Error(
      `аккаунт ${raw} не подключён в приложении — вести @BotFather от его имени ` +
        'можно только после того, как его владелец сам вошёл в свой Telegram'
    )
  }
  return { ctx: acting, as: raw }
}

export async function configureMainMiniApp(
  args: MainAppArgs,
  ctx: ToolContext,
  deps: MainAppDeps = {}
): Promise<MainAppResult> {
  requireOwner(ctx)

  const raw = String(args?.bot ?? '').trim()
  if (!BOT_USERNAME.test(raw) || !/bot$/i.test(raw)) {
    throw new Error('bot: нужно имя бота фермы, например @example_bot')
  }
  // Before a single request leaves for Telegram: a refused `as` must cost
  // nothing and touch nothing.
  const acting = await actingAccount(args, ctx)
  const actingAs = acting.as ? { acting_as: acting.as } : {}
  const fetchImpl = deps.fetchImpl ?? fetch
  const farmBot = await tokenForBot(raw, fetchImpl)
  if (!farmBot) {
    throw new Error(
      `@${normaliseBotName(raw)} не из фермы: среди токенов рендера такого бота нет`
    )
  }
  const bot = '@' + farmBot.username
  const token = farmBot.token

  const me = await getMe(token, fetchImpl)
  if (me.username !== farmBot.username) {
    throw new Error(`${bot}: getMe назвал другого бота, ничего не делаю`)
  }
  const dry = args?.dry_run === true
  if (me.hasMainWebApp === true) {
    ;(deps.log ?? console.log)(
      `[botfather-main-app] ${bot} precheck already_on`
    )
    return {
      bot,
      status: 'already_on',
      ...actingAs,
      has_main_web_app: true,
      ...(dry ? { dry_run: true as const } : {}),
    }
  }

  const given = args?.url == null ? '' : String(args.url).trim()
  const rawUrl = given || (await menuButtonUrl(token, fetchImpl)) || ''
  const source = given ? 'argument' : 'menu_button'
  if (!rawUrl) {
    throw new Error(
      `${bot}: у кнопки меню нет адреса приложения — передайте url явно`
    )
  }
  const checked = checkAppUrl(rawUrl)
  if ('problem' in checked) {
    throw new Error(`${bot}: url отклонён — ${checked.problem}`)
  }
  // From here on only the normalised form exists: it is what is shown in
  // the plan, what BotFather is sent and what the result reports.
  const url = checked.href

  if (dry) {
    return {
      bot,
      status: 'dry_run',
      ...actingAs,
      url,
      url_source: source,
      has_main_web_app: me.hasMainWebApp,
      dry_run: true,
      plan: planFor(bot, url),
    }
  }

  if (running) {
    throw new Error(
      `BotFather уже настраивается для ${running}: дождитесь конца того прогона`
    )
  }
  running = bot
  try {
    // A run through somebody else's Telegram is never silent: this line is
    // the record that it happened, and it names only the account and the bot.
    if (acting.as) {
      ;(deps.log ?? console.log)(
        `[botfather-main-app] ${bot} acting_as ok (account ${acting.as})`
      )
    }
    const open =
      deps.openChat ??
      ((c: ToolContext, fn: (chat: BotFatherChat) => Promise<unknown>) =>
        withClient(c, live => fn(gramBotFather(live as unknown as GramLike))))
    const drive = (await open(acting.ctx, chat =>
      driveBotFather(
        chat,
        { username: farmBot.username, url },
        {
          stepTimeoutMs: deps.stepTimeoutMs,
          pollMs: deps.pollMs,
          log: deps.log,
        }
      )
    )) as DriveResult

    // The proof is Telegram's own flag, not BotFather's wording.
    let after: boolean | null = null
    try {
      after = (await getMe(token, fetchImpl)).hasMainWebApp
    } catch {
      after = null
    }
    ;(deps.log ?? console.log)(
      `[botfather-main-app] ${bot} verify ${after === true ? 'ok' : 'stop'}`
    )

    const status: MainAppResult['status'] =
      drive.outcome === 'stopped'
        ? 'stopped'
        : drive.outcome === 'already_on'
          ? 'already_on'
          : after === true
            ? 'enabled'
            : 'unverified'
    return {
      bot,
      status,
      ...actingAs,
      url,
      url_source: source,
      has_main_web_app: after,
      steps: [...drive.steps, { step: 'verify', ok: after === true }],
      ...(drive.stoppedAt ? { stopped_at: drive.stoppedAt } : {}),
      ...(drive.reason ? { reason: drive.reason } : {}),
      transcript: drive.transcript,
      ...(drive.lastButtons ? { last_buttons: drive.lastButtons } : {}),
      url_sent: drive.urlSent,
    }
  } finally {
    running = null
  }
}

export const BOTFATHER_TOOLS: AgentTool[] = [
  {
    name: 'botfather_main_app',
    description:
      'Включает Main Mini App одному боту фермы в @BotFather: /mybots → бот → ' +
      'Bot Settings → Configure Mini App → Enable Mini App → адрес приложения. ' +
      'Звать может только владелец платформы и только напрямую; боты — только ' +
      'фермы, адрес — только нашего приложения (по умолчанию адрес кнопки меню ' +
      'бота). @BotFather показывает бота лишь тому аккаунту, который его создал, ' +
      'поэтому as=<telegram_id> ведёт диалог от имени этого аккаунта — только ' +
      'если он сам подключён в приложении и только с authorized_by_owner=true. ' +
      'Путь заранее известен: неожиданный ответ или нет кнопки — остановка и ' +
      'расшифровка слов BotFather. После прогона — проверка getMe ' +
      '(has_main_web_app). dry_run=true — только план, ничего не отправляет.',
    parameters: {
      type: 'object',
      properties: {
        bot: {
          type: 'string',
          description: 'имя бота фермы, например @example_bot',
        },
        url: {
          type: 'string',
          description:
            'адрес Main Mini App; по умолчанию — адрес web_app кнопки меню бота',
        },
        dry_run: {
          type: 'boolean',
          description: 'только показать план, ничего не отправлять',
        },
        as: {
          type: 'string',
          description:
            'Telegram ID аккаунта, от имени которого вести @BotFather ' +
            '(тот, кто создал бота); нужен подключённый аккаунт и ' +
            'authorized_by_owner=true',
        },
        authorized_by_owner: {
          type: 'boolean',
          description:
            'подтверждение владельца на этот прогон от чужого аккаунта; ' +
            'обязательно вместе с as',
        },
      },
      required: ['bot'],
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx: ToolContext) {
      return configureMainMiniApp(a, ctx)
    },
  },
]
