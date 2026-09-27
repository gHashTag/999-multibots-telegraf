/**
 * EVERY AGENT HAS A DESK OF ITS OWN.
 *
 * Owner, 2026-09-23: "and every agent, by its profile, has a personal
 * cabinet laid out for the work that profile does."
 *
 * A profile is a line of work: looking for work, telling the world about
 * Trinity, keeping the person's own house in order. Each one knows the
 * accounts that belong to it -- and only those, so a round for work does not
 * drag the person through TikTok, and a round for content does not open
 * their job invitations.
 *
 * The list here is the DEFAULT. Each profile's row in agent_strategies
 * (`rounds:<id>`) overrides its sites and its pace without a deploy
 * (strategies.ts), which is how a desk is rearranged by the person who sits
 * at it rather than by a release.
 */
import type { Site } from './strategies'
import { SUBREDDITS, redditSites } from './reddit'

export interface Profile {
  id: string
  /** What the person calls this line of work. */
  name: string
  /** One line: what this desk is for. */
  about: string
  sites: Site[]
}

export const PROFILES: Profile[] = [
  {
    id: 'work',
    name: 'Работа', // cyrillic-ok: shown to the person
    about: 'Приглашения, отклики и вакансии', // cyrillic-ok
    sites: [
      { name: 'hh.ru', url: 'https://hh.ru/applicant/negotiations' },
      { name: 'LinkedIn', url: 'https://www.linkedin.com/feed/' },
      /* Reviews, mentions and invitations to repositories (#2965). */
      { name: 'GitHub', url: 'https://github.com/notifications' },
    ],
  },
  {
    id: 'content',
    name: 'Контент', // cyrillic-ok
    about: 'Что отвечают на статьи и посты', // cyrillic-ok
    sites: [
      { name: 'X', url: 'https://x.com/notifications' },
      /* Reddit moved out to a desk of its own, below. */
      { name: 'YouTube', url: 'https://www.youtube.com/feed/subscriptions' },
      { name: 'TikTok', url: 'https://www.tiktok.com/foryou' },
      /*
       * The rest of the clone's networks (#2965, epic #2961). A network the
       * browser is not signed into costs the round nothing: it is named as
       * "not connected" and not opened (rounds.ts isNotConnected).
       */
      { name: 'Instagram', url: 'https://www.instagram.com/' },
      { name: 'Threads', url: 'https://www.threads.com/activity' },
      { name: 'Facebook', url: 'https://www.facebook.com/notifications' },
      { name: 'VK', url: 'https://vk.com/feed' },
    ],
  },
  /*
   * REDDIT HAS A DESK OF ITS OWN because it is the one network where the work
   * is a conversation rather than a feed: the answers arrive in an inbox, and
   * posting is allowed only where the community says so (agent/reddit.ts).
   * Owner, 2026-09-27: "set up my Reddit and posting into the relevant groups
   * to get t27 moving, and have it answer the comments."
   *
   * The desk WALKS the inbox and the communities it may post to; answering and
   * posting are the tick's work (agent/reddit-wiring.ts), and both wait for the
   * owner's tap.
   */
  {
    id: 'reddit',
    name: 'Reddit',
    about: 'Ответы в комментариях и посты в профильные сообщества', // cyrillic-ok
    /*
     * SHORT ON PURPOSE: the inbox, and our own community. The desk's real work
     * in the other communities is reading their rules and asking the owner --
     * both done through Reddit's own JSON in the tick, not by walking pages --
     * and the whole-round walk is capped at MAX_SITES (strategies.ts), so a
     * desk that listed eight feeds would silently push another desk's site out.
     */
    sites: redditSites(SUBREDDITS.filter(s => s.promo === 'own')),
  },
]

/** The strategy row a profile reads and writes. Pure. */
export function strategyKeyOf(profileId: string): string {
  const id = String(profileId ?? '')
    .trim()
    .toLowerCase()
  return id && id !== 'all' ? `rounds:${id.slice(0, 40)}` : 'rounds'
}

/** The profile by its id, or null. Pure. */
export function profileOf(id: unknown): Profile | null {
  if (typeof id !== 'string' || !id.trim()) return null
  const key = id.trim().toLowerCase()
  return PROFILES.find(p => p.id === key) ?? null
}

/** Every site of every profile, in order, without repeats. Pure. */
export function allSites(): Site[] {
  const seen = new Set<string>()
  const out: Site[] = []
  for (const p of PROFILES)
    for (const s of p.sites) {
      if (seen.has(s.url)) continue
      seen.add(s.url)
      out.push(s)
    }
  return out
}
