/**
 * THE SIGN-IN PLAYBOOK, WHICH USED TO BE A DANGLING REFERENCE.
 *
 * `LOGINS_NOTE` told every agent to "follow the sign-in playbook". There was
 * no playbook: the words appeared once, in that sentence, and nowhere else in
 * the codebase. Measured on the owner's own pod, 2026-09-24..26, this is what
 * that cost: five identical permission requests to sign in to Upwork, ~110 s
 * each, none of which became a login; one attempt that did reach the sign-in
 * form and stopped halfway; and `browser_recipes` holding a single row about a
 * sign-in button out of five networks tried. The agent had the tools and no
 * order to use them in, so every attempt started from nothing.
 *
 * Owner, 2026-09-26: "learn to keep the successful experience, so a fast
 * sign-in can be called afterwards." So the playbook is two things and not
 * one:
 *
 *   THE ORDER, which is the same for every site and lives here: the door, the
 *   page as it actually is, the labelled press, the person's own typing, the
 *   proof. It is a constant, not a model's improvisation.
 *
 *   WHAT THIS SITE TURNED OUT TO WANT, which lives in `browser_recipes` and is
 *   written by the presses themselves (recipes.ts). That is the part that makes
 *   the SECOND sign-in fast, and it is learned rather than declared, because
 *   the labels are what sites change.
 *
 * TWO RULES THAT ARE NOT NEGOTIABLE, and are asserted rather than described:
 *
 *   1. THE PERSON TYPES THE SECRET. Every password, every code, every one-time
 *      link goes through `browser_ask_input`, where the agent learns only that
 *      something was typed and how long it was. An agent that types a password
 *      it holds is an agent that holds a password.
 *   2. A COOKIE IS THE PROOF, not a page that looks friendly. "Signed in" is
 *      `logins.ts` seeing the network's own login cookie -- read on the browser
 *      socket, names only -- and nothing else counts, because a site can show
 *      a name and a photo to a session it has already revoked.
 *
 * WHAT IS DELIBERATELY NOT HERE. No selectors and no button labels: those age
 * badly, and the two mechanisms above already cover them -- the page is read
 * before it is pressed, and what answered is remembered. The cookie names and
 * the domains are not here either; they are `NETWORKS` in logins.ts, which is
 * their one home.
 *
 * The published form of this file is specs/automation/browser-sign-in.t27 in
 * the t27 repository: same claims, compiler-checked, with the tests below as
 * its test blocks.
 */
import { NETWORKS, type NetworkLogin } from './logins'
import { hostOf, learnedHere, type Learned } from './recipes'
import type { Queryable } from './sessions'

/**
 * WHERE EACH NETWORK'S DOOR IS.
 *
 * A sign-in page, not a home page: opening instagram.com while signed out
 * lands on a feed-shaped wall that reads as "nothing new" to a round, and the
 * agent then reports a quiet day instead of a sign-in it could have finished.
 * Only networks whose door we actually know are listed; for the rest the
 * playbook says "open the site and find the sign-in link", which is honest.
 */
export const DOORS: Record<string, string> = {
  google: 'https://accounts.google.com/',
  youtube: 'https://accounts.google.com/',
  x: 'https://x.com/i/flow/login',
  linkedin: 'https://www.linkedin.com/login',
  tiktok: 'https://www.tiktok.com/login',
  instagram: 'https://www.instagram.com/accounts/login/',
  threads: 'https://www.threads.com/login',
  facebook: 'https://www.facebook.com/login',
  reddit: 'https://www.reddit.com/login',
  github: 'https://github.com/login',
  vk: 'https://vk.com/login',
  hh: 'https://hh.ru/account/login',
  upwork: 'https://www.upwork.com/ab/account-security/login',
  habr: 'https://habr.com/kek/v1/auth/habrahabr/?back=/ru/all/',
  medium: 'https://medium.com/m/signin',
}

/** Networks whose door is a Google account, so signing into one signs in both. */
export const THROUGH_GOOGLE = ['youtube'] as const

export interface Step {
  /** The tool that does it. Named so an agent does not have to guess. */
  tool: string
  /** What this step is for, in one line. */
  does: string
}

/**
 * THE ORDER. Every site, every time, and the reason each step exists is in the
 * line next to it. Read as data by the tool; asserted by the tests.
 */
export const PLAYBOOK: Step[] = [
  {
    tool: 'browser_open',
    does: 'open the door -- the sign-in page itself, never the home page',
  },
  {
    tool: 'browser_read',
    does: 'read the page as it IS; the labels are not what they were last month',
  },
  {
    tool: 'browser_click',
    does:
      'press the way in by its label ("Continue with Google", "Sign in"); ' +
      'the press is remembered, so the next time starts here',
  },
  {
    tool: 'browser_ask_input',
    does:
      'the person types the email, the password and the code THEMSELVES ' +
      '(kind=email|password|code); you never learn any of them',
  },
  {
    tool: 'browser_logins',
    does:
      'proof: the network reports signed_in, or it did not work. A friendly ' +
      'page is not proof',
  },
]

/** The rules that survive any site's redesign. Said once, here. */
export const RULES = [
  'The person types every secret (browser_ask_input). Never browser_type a password, a code or a recovery phrase.',
  'A cookie is the proof: browser_logins must report signed_in before you say it worked.',
  'Press by label, not by coordinates: a label is remembered and a guess from a screenshot is not.',
  'One network at a time. A sign-in half-finished in three tabs is three dead ends.',
  'If the site asks for a captcha or a phone, stop and ask the person (browser_ask_input kind=action).',
] as const

export interface Playbook {
  network: string
  name: string
  /** The sign-in page, or null when we do not know this network's door. */
  door: string | null
  steps: Step[]
  rules: readonly string[]
  /** What the browser holds for this network right now, when it could be read. */
  state: NetworkLogin['state'] | 'unreadable'
  /** What earlier presses on this site taught us. The fast path. */
  learned: Learned[]
  /** Said plainly when the door is unknown. */
  note?: string
}

/** The network as `NETWORKS` knows it, by id or by the name a person says. */
export function networkNamed(
  asked: string
): (typeof NETWORKS)[number] | undefined {
  const want = String(asked ?? '')
    .trim()
    .toLowerCase()
  if (!want) return undefined
  return NETWORKS.find(
    n =>
      n.id === want || n.name.toLowerCase() === want || want === `${n.id}.com`
  )
}

/**
 * What this site already taught us, and nothing about any other site. A
 * recipe is keyed by host, so the door's host is what selects it -- which is
 * also why a door that is somebody else's host (Google's, for YouTube) finds
 * Google's lessons, correctly.
 */
export function lessonsFor(door: string | null, all: Learned[]): Learned[] {
  const host = door ? hostOf(door) : ''
  if (!host) return []
  return all.filter(l => l.host === host || host.endsWith(`.${l.host}`))
}

/**
 * The playbook for one network: the same order every time, plus whatever this
 * site turned out to want. Reads; presses nothing.
 */
export async function playbookFor(
  q: Queryable,
  asked: string,
  logins: NetworkLogin[] | null
): Promise<Playbook | null> {
  const net = networkNamed(asked)
  if (!net) return null
  const door = DOORS[net.id] ?? null
  const state = logins
    ? (logins.find(l => l.id === net.id)?.state ?? 'unknown')
    : 'unreadable'
  const learned = lessonsFor(door, await learnedHere(q, 200))
  return {
    network: net.id,
    name: net.name,
    door,
    steps: PLAYBOOK,
    rules: RULES,
    state,
    learned,
    ...(door
      ? {}
      : {
          note:
            'this network has no door here: open the site and find its ' +
            'sign-in link, then the order below is unchanged',
        }),
  }
}

/** Did it work? The cookie says so or nothing does. Pure. */
export function signedIn(
  network: string,
  logins: NetworkLogin[] | null
): boolean {
  return logins?.find(l => l.id === network)?.state === 'signed_in'
}
