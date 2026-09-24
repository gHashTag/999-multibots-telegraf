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
      { name: 'Upwork', url: 'https://www.upwork.com/nx/find-work/' },
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
      { name: 'Reddit', url: 'https://www.reddit.com/r/t27ai/' },
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
