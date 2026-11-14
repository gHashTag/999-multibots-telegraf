/**
 * LINKEDIN AND X FOR course_outreach, IN THE OWNER'S OWN BROWSER.
 *
 * Course-outreach spec v2 (gHashTag/t27 specs/automation/course-outreach.t27,
 * vendored in ../spec): round_go, network_verdict, network_channel,
 * NETWORK_READ_MAX, NETWORK_SCROLLS.
 *
 * ONE BROWSER, TWO PILOTS. Everything here drives the owner's own Chromium
 * -- the one he watches in the app -- through the desk door
 * (browser/desk-page.ts): his site list is asked before every open, the
 * guard (guard.ts mayAct, via deskMayAct) before every press and every
 * keystroke, and an address an agent may not open (guard.ts agentMayOpen) is
 * never opened. Each tab is brought to the front, so he sees the round and
 * the send as they happen, and can take the wheel at any moment; while he
 * holds it the round does not start and the send presses nothing.
 *
 * READING (the round) presses nothing: it opens his LinkedIn connections and
 * his X following and followers, scrolls the list (NETWORK_SCROLLS times),
 * reads each person's name and the headline or bio THEY wrote, and closes
 * its tab. A page that shape-shifted, or sent us to a sign-in page, reads as
 * not read -- "unknown", never "no programmers".
 *
 * SENDING happens only after the owner pressed Allow on that one message's
 * card (course-outreach-tool.ts): his profile page, the "Message" button by
 * its printed label (browser/find-target.ts), the message box, the text
 * exactly as it was on the card, "Send". Then the page is read back for the
 * text -- the receipt. A missing control stops there, says which, and leaves
 * the tab open in front of him.
 *
 * WHAT IS NOT VERIFIED, said here and in the tool's answer: the readers and
 * the send labels below were written against no live pod (none was reachable
 * when they were written). LinkedIn and X change their markup; a reader that
 * finds nothing makes the round say "unknown", and a label that is not found
 * makes the send say "not sent".
 *
 * Passwords: none. Whether he is signed in is browser_logins' answer
 * (logins.ts) and nothing else; this file never opens a sign-in page on
 * purpose, never asks for a secret and never types one.
 */
import type { Queryable } from '../browser/sessions'
import type { NetworkLogin } from '../browser/logins'
import type { ToolContext } from './tools'
import { NETWORK_READ_MAX, NETWORK_SCROLLS, type Net } from './course-outreach'

/** One person a network list showed, before any judgement. */
export interface NetPerson {
  lead: string
  network: Net
  handle: string
  name: string
  /** The headline (LinkedIn) or bio (X) THEY wrote, as the page showed it. */
  about: string
  url: string
  /** A first-degree LinkedIn connection. */
  connection: boolean
  /** On X: this person follows the owner. */
  followsOwner: boolean
}

export interface NetRead {
  ok: boolean
  /** Why the page did not read, in a few words. */
  why?: string
  people: NetPerson[]
}

const settle = (ms: number) => new Promise(r => setTimeout(r, ms))

/** A page that is a sign-in page, not the list. Pure. */
export function signInWall(url: string): boolean {
  let path = ''
  try {
    path = new URL(url).pathname.toLowerCase()
  } catch {
    return true
  }
  return /\/(login|authwall|checkpoint|signup|uas\/login|i\/flow\/login|i\/flow\/signup)(\/|$)/.test(
    path
  )
}

/** One-line text, cut. Pure. */
const flat = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

/**
 * The rows a list probe returned, made into people. Anything that is not a
 * plausible handle is dropped; nothing is guessed. Pure.
 *
 * `allFollow`: the followers page, where everybody follows the owner.
 */
export function peopleOf(
  network: Net,
  raw: unknown,
  allFollow = false
): NetPerson[] {
  const rows = Array.isArray(raw) ? raw : []
  const out: NetPerson[] = []
  for (const r of rows) {
    const o = (r ?? {}) as Record<string, unknown>
    const handle = String(o.handle ?? '').trim()
    if (network === 'linkedin') {
      if (!/^[A-Za-z0-9%_-]{1,100}$/.test(handle)) continue
      out.push({
        lead: `linkedin:${handle}`,
        network,
        handle,
        name: flat(o.name, 100),
        about: flat(o.about, 300),
        url: `https://www.linkedin.com/in/${handle}/`,
        connection: true,
        followsOwner: false,
      })
    } else {
      if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) continue
      out.push({
        lead: `x:${handle.toLowerCase()}`,
        network,
        handle,
        name: flat(o.name, 100),
        about: flat(o.about, 300),
        url: `https://x.com/${handle}`,
        connection: false,
        followsOwner: allFollow || o.followsYou === true,
      })
    }
  }
  return out
}

/** Two reads of one network merged by lead; a follow seen anywhere counts. Pure. */
export function merged(lists: readonly NetPerson[][]): NetPerson[] {
  const by = new Map<string, NetPerson>()
  for (const list of lists)
    for (const p of list) {
      const old = by.get(p.lead)
      if (!old) by.set(p.lead, { ...p })
      else {
        old.followsOwner = old.followsOwner || p.followsOwner
        old.connection = old.connection || p.connection
        if (!old.about && p.about) old.about = p.about
      }
    }
  return [...by.values()]
}

/** X's own button words that are not a bio, in both languages. */
const X_NOT_BIO = [
  'follow',
  'following',
  'follows you',
  'unfollow',
  'читать', // cyrillic-ok: X's Russian label
  'читаю', // cyrillic-ok: X's Russian label
  'читает вас', // cyrillic-ok: X's Russian label
]

/*
 * The probes each list page runs: rows of {handle, name, about}. Read by the
 * attributes the networks render; a page that changed shape yields nothing,
 * and the round says "unknown" -- never a guess. Only inside <main>, so the
 * owner's own profile link in the top bar is not read as a connection.
 */
export const PROBE = {
  linkedin: `(() => {
    const root = document.querySelector('main') || document.body;
    const slugOf = h => { const m = /\\/in\\/([^/?#]+)/.exec(h || ''); return m ? m[1] : '' };
    const card = a => {
      const li = a.closest('li'); if (li) return li;
      let box = a;
      for (let i = 0; i < 6 && box.parentElement; i++) {
        const up = box.parentElement;
        const slugs = new Set([...up.querySelectorAll('a[href*="/in/"]')].map(x => slugOf(x.getAttribute('href'))));
        if (slugs.size > 1) break;
        box = up;
      }
      return box;
    };
    const out = []; const seen = new Set();
    for (const a of root.querySelectorAll('a[href*="/in/"]')) {
      const slug = slugOf(a.getAttribute('href'));
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const box = card(a);
      const n = box.querySelector('.mn-connection-card__name');
      const o = box.querySelector('.mn-connection-card__occupation');
      const lines = (box.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
      const name = (n && n.innerText.trim()) || lines[0] || '';
      const about = (o && o.innerText.trim()) || lines.filter(l => l !== name).slice(0, 2).join(' | ');
      out.push({ handle: slug, name, about });
    }
    return { url: location.href, rows: out };
  })()`,
  x: `(() => {
    const skip = new Set(${JSON.stringify(X_NOT_BIO)});
    const out = [];
    for (const cell of document.querySelectorAll('[data-testid="UserCell"]')) {
      const h = [...cell.querySelectorAll('a[href^="/"]')]
        .map(l => (l.getAttribute('href') || '').split('/')[1])
        .find(x => x && /^[A-Za-z0-9_]{1,15}$/.test(x));
      if (!h) continue;
      const lines = (cell.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
      const at = lines.findIndex(l => l.toLowerCase() === '@' + h.toLowerCase());
      const name = at > 0 ? lines[at - 1] : (lines[0] || '');
      const about = lines.slice(at >= 0 ? at + 1 : 1).filter(l => !skip.has(l.toLowerCase())).join(' ');
      out.push({ handle: h, name, about,
                 followsYou: !!cell.querySelector('[data-testid="userFollowIndicator"]') });
    }
    return { url: location.href, rows: out };
  })()`,
  /* Whose X this is: the profile link of the signed-in account. */
  xMe: `(() => {
    const a = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    return { url: location.href, handle: a ? (a.getAttribute('href') || '').split('/')[1] || '' : '' };
  })()`,
} as const

export const SCROLL = `window.scrollTo(0, document.body.scrollHeight); true`

/** The list pages, by network. */
export const LIST_URL = {
  linkedin: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
  xHome: 'https://x.com/home',
} as const

/**
 * The words each network prints on the controls of a direct message, in
 * order: the button on the person's profile, the message box, the button
 * that sends. English and the Russian his browser may show.
 */
export const SEND_STEPS: Record<
  Net,
  { open: string[]; box: string[]; send: string[] }
> = {
  linkedin: {
    open: ['message', 'сообщение'], // cyrillic-ok: LinkedIn's Russian label
    box: ['write a message', 'напишите сообщение'], // cyrillic-ok: LinkedIn's Russian label
    send: ['send', 'отправить'], // cyrillic-ok: LinkedIn's Russian label
  },
  x: {
    open: ['message', 'сообщение'], // cyrillic-ok: X's Russian label
    box: ['start a new message', 'начните новое сообщение'], // cyrillic-ok: X's Russian label
    send: ['send', 'отправить'], // cyrillic-ok: X's Russian label
  },
}

/** The first characters of a sent text, looked for on the page after. Pure. */
export function receiptSnippet(text: string): string {
  return flat(text, 40)
}

// ---- the real browser ---------------------------------------------------------------

type Io = {
  cdp: string
  who: { pool: Queryable; telegramId: string }
}

async function deskOf(ctx: ToolContext): Promise<Io> {
  const pool = ctx.pool as unknown as Queryable
  const owner = String(ctx.telegramId)
  const { endpointOf } = await import('./reddit-wiring')
  return {
    cdp: await endpointOf(pool, owner, 'course-outreach'),
    who: { pool, telegramId: owner },
  }
}

/** Open one page in front of the person, by the desk door. */
async function openInFront(io: Io, url: string): Promise<string> {
  const { agentMayOpen } = await import('../browser/guard')
  if (!agentMayOpen(url)) throw new Error(`an agent may not open ${url}`)
  const { newDeskPage } = await import('../browser/desk-page')
  const { activatePage } = await import('../browser/cdp')
  const page = await newDeskPage(io.cdp, url, io.who)
  await activatePage(io.cdp, page.id).catch(() => {})
  return page.id
}

/**
 * Read one list page: probe, scroll, probe again, NETWORK_SCROLLS times,
 * accumulating by handle (X drops rows that scrolled away). Closes its tab.
 */
async function readList(
  io: Io,
  network: Net,
  url: string,
  allFollow: boolean
): Promise<NetRead> {
  const { evaluateOn, closePage } = await import('../browser/cdp')
  const id = await openInFront(io, url)
  try {
    await settle(8_000)
    const lists: NetPerson[][] = []
    for (let i = 0; i <= NETWORK_SCROLLS; i++) {
      const got = (await evaluateOn(io.cdp, id, PROBE[network]).catch(
        () => null
      )) as { url?: unknown; rows?: unknown } | null
      if (!got || !Array.isArray(got.rows))
        return { ok: false, why: 'the list did not read', people: [] }
      if (signInWall(String(got.url ?? '')))
        return { ok: false, why: 'sent to a sign-in page', people: [] }
      lists.push(peopleOf(network, got.rows, allFollow))
      if (merged(lists).length >= NETWORK_READ_MAX) break
      await evaluateOn(io.cdp, id, SCROLL).catch(() => null)
      await settle(1_500)
    }
    return { ok: true, people: merged(lists).slice(0, NETWORK_READ_MAX) }
  } finally {
    await closePage(io.cdp, id).catch(() => {})
  }
}

/** The real round for one network. */
export async function readNetwork(
  ctx: ToolContext,
  network: Net
): Promise<NetRead> {
  const io = await deskOf(ctx)
  if (network === 'linkedin')
    return await readList(io, 'linkedin', LIST_URL.linkedin, false)
  /* X: whose account this is first, then his following and his followers. */
  const { evaluateOn, closePage } = await import('../browser/cdp')
  const home = await openInFront(io, LIST_URL.xHome)
  let me = ''
  try {
    await settle(8_000)
    const got = (await evaluateOn(io.cdp, home, PROBE.xMe).catch(
      () => null
    )) as { url?: unknown; handle?: unknown } | null
    if (got && signInWall(String(got.url ?? '')))
      return { ok: false, why: 'sent to a sign-in page', people: [] }
    me = String(got?.handle ?? '')
  } finally {
    await closePage(io.cdp, home).catch(() => {})
  }
  if (!/^[A-Za-z0-9_]{1,15}$/.test(me))
    return {
      ok: false,
      why: 'could not tell whose X account this is',
      people: [],
    }
  const following = await readList(
    io,
    'x',
    `https://x.com/${me}/following`,
    false
  )
  const followers = await readList(
    io,
    'x',
    `https://x.com/${me}/followers`,
    true
  )
  if (!following.ok && !followers.ok)
    return { ok: false, why: following.why ?? followers.why, people: [] }
  return {
    ok: following.ok && followers.ok,
    ...(following.ok && followers.ok
      ? {}
      : { why: `one list did not read: ${following.why ?? followers.why}` }),
    people: merged([following.people, followers.people]).slice(
      0,
      NETWORK_READ_MAX
    ),
  }
}

export type NetSent =
  | { done: true; receipt: boolean }
  | { done: false; why: string }

/**
 * THE ONLY WRITE, called by course-outreach-tool.ts for a card the owner
 * allowed and for nothing else. Every press and the typing pass deskMayAct
 * (his site list, the guard, the wheel). The tab is left open in front of
 * him when a control is missing.
 */
export async function sendOnNetwork(
  ctx: ToolContext,
  network: Net,
  person: { url: string },
  text: string
): Promise<NetSent> {
  const { pressOne } = await import('./reddit-wiring')
  const { deskType } = await import('../browser/desk-page')
  const { evaluateOn, closePage } = await import('../browser/cdp')
  const io = await deskOf(ctx)
  const id = await openInFront(io, person.url)
  const s = SEND_STEPS[network]
  try {
    await settle(8_000)
    const where = String(
      await evaluateOn(io.cdp, id, 'location.href').catch(() => '')
    )
    if (signInWall(where))
      return { done: false, why: 'sent to a sign-in page: nothing typed' }
    await pressOne(io.who, io.cdp, id, s.open)
    await settle(3_000)
    await pressOne(io.who, io.cdp, id, s.box)
    await settle(1_000)
    await deskType(io.who, io.cdp, id, text)
    await settle(1_500)
    await pressOne(io.who, io.cdp, id, s.send)
  } catch (e) {
    return {
      done: false,
      why: String((e as Error)?.message ?? e).slice(0, 160),
    }
  }
  await settle(4_000)
  const snippet = receiptSnippet(text)
  const seen = await evaluateOn(
    io.cdp,
    id,
    `document.body.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(snippet)})`
  ).catch(() => false)
  if (seen === true) await closePage(io.cdp, id).catch(() => {})
  return { done: true, receipt: seen === true }
}

/** The person's logins, as browser_logins reads them; null when unknown. */
export async function loginsFor(
  ctx: ToolContext
): Promise<NetworkLogin[] | null> {
  const { loginsOfPerson } = await import('../browser/logins')
  return await loginsOfPerson(
    ctx.pool as unknown as Queryable,
    String(ctx.telegramId)
  ).catch(() => null)
}

/** Is the person driving his browser right now? */
export async function personDriving(ctx: ToolContext): Promise<boolean> {
  const { readSession, personHasTheWheel } = await import('../browser/sessions')
  const s = await readSession(
    ctx.pool as unknown as Queryable,
    String(ctx.telegramId)
  ).catch(() => null)
  return personHasTheWheel(s, Date.now())
}
