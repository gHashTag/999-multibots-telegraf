/**
 * THE AGENT DOES A ROUND OF THE ACCOUNTS THE PERSON CONNECTED.
 *
 * Owner, 2026-09-23: "run it where we signed in -- we need to see how the
 * agent works -- and set up the crons and the logging".
 *
 * Every few hours the agent walks the person's own browser through the
 * accounts they connected -- LinkedIn, X, TikTok, YouTube -- reads each one
 * and sends ONE message: what is new where, in their words. It presses
 * nothing, writes nothing, answers nobody: a round is looking, and anything
 * outward still waits for the person's yes.
 *
 * Three things are deliberate:
 *
 * 1. IT NEVER TAKES THE WHEEL FROM THE PERSON. While they are driving, the
 *    round is skipped entirely -- a page opening under somebody's hands is
 *    the rudest thing this product could do.
 * 2. THE COUNT COMES FROM THE TAB'S OWN TITLE. Sites put it there -- "(15)
 *    Subscriptions - YouTube", "(1) Notifications / X" -- so a round needs no
 *    scraping rules per site and does not age with their markup.
 * 3. IT SAYS WHEN IT SAW NOTHING. A silent round is indistinguishable from a
 *    broken one, so the message always lists every site, even the quiet ones.
 */
import { itemLine, type Item } from '../browser/items'

export interface Site {
  name: string
  url: string
}

/** The accounts a round walks, in the order the person hears about them. */
export const ROUND_SITES: Site[] = [
  /* Work first: an invitation is worth more than a feed. */
  { name: 'hh.ru', url: 'https://hh.ru/applicant/negotiations' },
  { name: 'LinkedIn', url: 'https://www.linkedin.com/feed/' },
  { name: 'X', url: 'https://x.com/notifications' },
  { name: 'TikTok', url: 'https://www.tiktok.com/foryou' },
  { name: 'YouTube', url: 'https://www.youtube.com/feed/subscriptions' },
]

/** How long a page is given to draw itself before it is read. */
export const SETTLE_MS = 6_000
/**
 * A page that answered with nothing is given one more moment. Measured
 * 2026-09-23 over the person's own accounts: YouTube came back with an empty
 * title and no text on one walk in five and was fine three seconds later.
 */
export const SECOND_LOOK_MS = 3_000

/** Did the page answer with nothing at all? Pure. */
export function cameBackEmpty(got: { title: string; text: string }): boolean {
  return !String(got.title ?? '').trim() && !String(got.text ?? '').trim()
}

export interface Seen {
  name: string
  /** What the page listed, as rows (browser/items.ts); empty when none. */
  items?: Item[]
  /** The tab's title, as the browser reported it. */
  title: string
  /** The first words of the page, already folded to one line. */
  text: string
  ok: boolean
  ms: number
}

/**
 * The number a site puts in its own title, or null. Two shapes are in use
 * by the sites the person connected: "(15) Подписки - YouTube" and, on
 * hh.ru, "13 ・ Профиль". Pure.
 */
export function unreadOf(title: string): number | null {
  const t = String(title ?? '')
  const m = /^\s*\((\d+)\+?\)/.exec(t) ?? /^\s*(\d+)\+?\s*[・•·]/.exec(t)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Is this page a sign-in page rather than the account? Pure. */
export function looksSignedOut(seen: { title: string; text: string }): boolean {
  const hay = `${seen.title} ${seen.text}`.toLowerCase()
  /* The words a sign-in page shows, in both languages, matched as data. */
  const WORDS = [
    'sign in',
    'log in',
    'create account',
    'войти',
    'вход',
    'регистрац',
  ] // cyrillic-ok: page words
  const ASKS_TO_SIGN_IN = new RegExp(`(^|\\W)(${WORDS.join('|')})(\\W|$)`)
  return ASKS_TO_SIGN_IN.test(hay.slice(0, 200))
}

/** How many of a site's rows the message carries. */
export const LINES_PER_SITE = 2

/**
 * One line about one account -- and, when the page listed things, WHICH
 * things (browser/items.ts). "13 new" answers whether to look; "an
 * invitation to an interview" answers whether to hurry. Pure.
 */
export function lineFor(seen: Seen): string {
  if (!seen.ok) return `• ${seen.name}: не открылось` // cyrillic-ok: shown to the person
  if (looksSignedOut(seen)) return `• ${seen.name}: просит войти — вход слетел` // cyrillic-ok
  const n = unreadOf(seen.title)
  const head = n ? `${n} новых` : 'нового нет' // cyrillic-ok
  const rows = (seen.items ?? []).slice(0, LINES_PER_SITE)
  if (rows.length)
    return `• ${seen.name}: ${head}\n${rows.map(r => `   ◦ ${itemLine(r)}`).join('\n')}`
  const what = seen.text.trim().slice(0, 90)
  return `• ${seen.name}: ${head}${what ? ` — ${what}…` : ''}` // cyrillic-ok
}

/** The whole round, as one message. Pure. */
export function roundMessage(seen: Seen[], now: Date): string {
  const time = `${String(now.getUTCHours()).padStart(2, '0')}:${String(
    now.getUTCMinutes()
  ).padStart(2, '0')} UTC`
  const lines = seen.map(lineFor)
  const quiet = seen.every(s => s.ok && !unreadOf(s.title))
  return [
    `🔄 Обход ваших аккаунтов, ${time}`, // cyrillic-ok
    '',
    ...lines,
    '',
    quiet
      ? 'Ничего нового. Агент ничего не нажимал и никому не отвечал.' // cyrillic-ok
      : 'Агент только посмотрел: нажимать и отвечать он будет с вашего разрешения.', // cyrillic-ok
  ].join('\n')
}

/** What the log keeps about a round. Pure. */
export function roundLog(seen: Seen[]): string {
  return JSON.stringify(
    seen.map(s => ({
      site: s.name,
      ok: s.ok,
      ms: s.ms,
      unread: unreadOf(s.title),
      rows: (s.items ?? []).length,
      signedOut: s.ok ? looksSignedOut(s) : null,
    }))
  )
}

/**
 * Did the whole round come back with nothing? That is not five quiet sites;
 * that is a browser that has stopped being a browser (2026-09-23: Chromium
 * out of memory opened every tab blank). Pure.
 */
export function everythingWasBlank(seen: Seen[]): boolean {
  return (
    seen.length > 1 &&
    seen.every(s => !s.ok || (!s.title.trim() && !s.text.trim()))
  )
}

export interface RoundDeps {
  /** False when the person is driving: the round is skipped. */
  personHasTheWheel: () => Promise<boolean>
  /** Opens a page and returns its title and first words. */
  look: (
    url: string
  ) => Promise<{ title: string; text: string; items?: Item[] }>
  /**
   * Restarts the person's browser, keeping their logins, and says whether it
   * came back. Called once, and only when the whole round was blank.
   */
  restart?: () => Promise<boolean>
  tell: (text: string) => Promise<void>
  now: () => Date
  sites?: Site[]
}

/**
 * One round. Returns what the log should say. Never throws: a round that
 * fails must not take the render down, and the person hears either way.
 */
export async function runRound(d: RoundDeps): Promise<string> {
  if (await d.personHasTheWheel()) return 'the person is driving; skipped'
  const seen: Seen[] = []
  for (const site of d.sites ?? ROUND_SITES) {
    const at = Date.now()
    try {
      let got = await d.look(site.url)
      /* Nothing at all is usually a page that was not finished drawing. */
      if (cameBackEmpty(got)) got = await d.look(site.url)
      seen.push({
        name: site.name,
        title: String(got.title ?? ''),
        text: String(got.text ?? '')
          .replace(/\s+/g, ' ')
          .trim(),
        items: got.items ?? [],
        ok: true,
        ms: Date.now() - at,
      })
    } catch {
      seen.push({
        name: site.name,
        title: '',
        text: '',
        ok: false,
        ms: Date.now() - at,
      })
    }
  }
  /*
   * A round that saw nothing anywhere is a broken browser, not a quiet day.
   * It is restarted once and walked again; the person hears one message
   * either way, and it says which of the two happened.
   */
  if (d.restart && everythingWasBlank(seen)) {
    const cameBack = await d.restart().catch(() => false)
    if (cameBack) {
      const again = await runRound({ ...d, restart: undefined })
      return `browser was blank; restarted; ${again}`
    }
    await d
      .tell(
        'Ваш браузер перестал отвечать, и я не смог его перезапустить. ' + // cyrillic-ok: told to the person
          'Откройте вкладку «Браузер» и нажмите «Закрыть», затем «Открыть» — входы сохранятся.' // cyrillic-ok
      )
      .catch(() => {})
    return 'browser was blank; restart failed'
  }
  await d.tell(roundMessage(seen, d.now())).catch(() => {})
  return roundLog(seen)
}
