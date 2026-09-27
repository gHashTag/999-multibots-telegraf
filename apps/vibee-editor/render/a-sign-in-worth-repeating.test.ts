import { describe, it, expect } from 'vitest'
import {
  DOORS,
  PLAYBOOK,
  RULES,
  THROUGH_GOOGLE,
  WALLED,
  lessonsFor,
  networkNamed,
  playbookFor,
  signedIn,
} from './src/browser/sign-in'
import { NETWORKS, LOGINS_NOTE } from './src/browser/logins'

/**
 * A SIGN-IN THAT WORKED MUST MAKE THE NEXT ONE SHORTER.
 *
 * 2026-09-24..26 the owner could not be signed into anything through the
 * agent. Part of that was a browser that had stopped being a browser
 * (a-restart-that-did-not-happen.test.ts). The other part is here: every
 * attempt began from nothing, because `LOGINS_NOTE` pointed at a "sign-in
 * playbook" that did not exist -- five ~110 s attempts at one site, and one
 * learned label to show for five networks tried.
 *
 * What is pinned below is the part that must not drift: the order, the door
 * being a sign-in page and not a home page, the person typing their own
 * secrets, a cookie being the only proof, and lessons staying on the site that
 * taught them.
 */

const q = (rows: Record<string, unknown>[]) => ({
  query: async () => ({ rows }),
})

describe('the order, which does not change per site', () => {
  it('opens a door, reads, presses, lets the PERSON type, then proves it', () => {
    expect(PLAYBOOK.map(s => s.tool)).toEqual([
      'browser_open',
      'browser_read',
      'browser_click',
      'browser_ask_input',
      'browser_logins',
    ])
  })

  it('NEVER tells the agent to type the secret itself', () => {
    /* No STEP may name the typing tool at all: the secret step is the ask. */
    expect(PLAYBOOK.map(s => s.tool)).not.toContain('browser_type')
    const secret = PLAYBOOK.find(s => /password/i.test(s.does))
    expect(secret?.tool).toBe('browser_ask_input')
    /* And the prohibition is said out loud, where a model will read it. */
    expect(RULES.join(' ')).toMatch(/Never browser_type a password/)
    expect(RULES.join(' ')).toMatch(/cookie is the proof/i)
  })

  it('proves a sign-in by cookie and by nothing else', () => {
    const logins = [
      { id: 'x', name: 'X', state: 'signed_in' as const },
      { id: 'vk', name: 'VK', state: 'expired' as const },
    ]
    expect(signedIn('x', logins)).toBe(true)
    /* Expired is a page that still looks friendly. It is not a login. */
    expect(signedIn('vk', logins)).toBe(false)
    expect(signedIn('x', null)).toBe(false)
  })
})

describe('the doors', () => {
  it('is a SIGN-IN page every time, never a home page', () => {
    for (const [id, url] of Object.entries(DOORS)) {
      expect(url, id).toMatch(/^https:\/\//)
      expect(url, id).toMatch(/login|signin|sign-in|accounts\.google|auth/i)
    }
  })

  it('only names networks the logins reader also knows', () => {
    const known = new Set(NETWORKS.map(n => n.id))
    for (const id of Object.keys(DOORS)) expect(known.has(id), id).toBe(true)
  })

  it('finds a network by id or by the name a person says', () => {
    expect(networkNamed('LinkedIn')?.id).toBe('linkedin')
    expect(networkNamed(' x ')?.id).toBe('x')
    expect(networkNamed('github.com')?.id).toBe('github')
    expect(networkNamed('myspace')).toBeUndefined()
  })

  it('NAMES A GOOGLE DOOR ONLY WHERE ONE WAS SEEN', () => {
    /*
     * These two lists are the only claims in this file that are about the wider
     * internet rather than about our own code, so they are the two that rot. A
     * name here means somebody opened the page on the pod and read the button.
     */
    for (const id of THROUGH_GOOGLE) expect(DOORS[id], id).toBeTruthy()
    expect([...THROUGH_GOOGLE]).toContain('habr')
  })

  it('A WALL IS A DOOR WE DO NOT KNOCK ON, and it says why in words', () => {
    /*
     * The point is the reason, not the list: a bare set of ids invites the next
     * reader to "just retry harder" at exactly the place where retrying harder
     * is the thing this project refuses to build.
     */
    expect(Object.keys(WALLED).length).toBeGreaterThan(0)
    for (const [id, why] of Object.entries(WALLED)) {
      expect(DOORS[id], id).toBeTruthy()
      expect(why.length, id).toBeGreaterThan(20)
      expect(why, id).toMatch(/instead|import/)
      expect([...THROUGH_GOOGLE], id).not.toContain(id)
    }
  })
})

describe('what this site taught us, and only this site', () => {
  it('keeps another site out of this plan', () => {
    const all = [
      { host: 'linkedin.com', want: 'sign in', label: 'Sign in', hits: 2 },
      { host: 'upwork.com', want: 'continue', label: 'Continue', hits: 1 },
    ]
    expect(lessonsFor(DOORS.linkedin ?? null, all).map(l => l.host)).toEqual([
      'linkedin.com',
    ])
    /* A door on a subdomain still recognises its own site's lessons. */
    expect(lessonsFor('https://www.linkedin.com/login', all)).toHaveLength(1)
    expect(lessonsFor(null, all)).toEqual([])
  })

  it('hands back the plan with the learned press in it -- the fast path', async () => {
    const plan = await playbookFor(
      q([{ host: 'linkedin.com', want: 'sign in', label: 'Sign in', hits: 2 }]),
      'linkedin',
      [{ id: 'linkedin', name: 'LinkedIn', state: 'signed_out' }]
    )
    expect(plan?.door).toBe(DOORS.linkedin)
    expect(plan?.state).toBe('signed_out')
    expect(plan?.learned.map(l => l.label)).toEqual(['Sign in'])
  })

  it('says plainly when we do not know a network door, instead of guessing one', async () => {
    const without = NETWORKS.find(n => !DOORS[n.id])
    if (!without) return
    const plan = await playbookFor(q([]), without.id, null)
    expect(plan?.door).toBeNull()
    expect(plan?.note).toMatch(/find its sign-in link/)
    /* The order is still the order. */
    expect(plan?.steps).toHaveLength(5)
  })

  it('reports an unreadable browser as unreadable, not as signed out', async () => {
    /* signed_out sends an agent to sign in; the browser was merely off. */
    const plan = await playbookFor(q([]), 'x', null)
    expect(plan?.state).toBe('unreadable')
  })

  it('refuses a network nobody here has heard of', async () => {
    expect(await playbookFor(q([]), 'myspace', null)).toBeNull()
  })
})

describe('the note that used to dangle', () => {
  it('points at the tool that exists now', () => {
    expect(LOGINS_NOTE).toContain('browser_sign_in')
    expect(LOGINS_NOTE).not.toMatch(/sign-in playbook/)
  })
})
