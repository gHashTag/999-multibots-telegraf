/**
 * THE DAY'S PLAN FOR EVERYBODY IN THE ROOM, ONCE A DAY.
 *
 * Owner, 2026-09-24: "the agent must proactively push them to set their
 * profile up fully, and write a plan for the day for everyone in the group,
 * every day".
 *
 * ── WHAT IT MAY SAY, AND WHAT IT MAY NOT ───────────────────────────────────
 *
 * It may say only what we KNOW: who is in the room, whose profile is set up,
 * who wrote and when. It may not invent anybody's tasks. A "plan" made of
 * guesses about a person's day is read once, disbelieved, and muted -- and it
 * would be the assistant talking about people in front of them.
 *
 * ── SILENCE IS NOT SENT ────────────────────────────────────────────────────
 *
 * The same rule the hive report earned (queen-report.ts): a daily post with
 * nothing in it teaches the room to ignore the channel, and the one morning
 * that mattered is ignored with it. When every profile is ready and nobody is
 * waiting, this returns null and the room stays quiet.
 *
 * ── THE NUDGE IS CONCRETE OR IT IS NOT A NUDGE ─────────────────────────────
 *
 * "Set up your profile" is noise. What is missing, and the one step that
 * closes it, is a nudge. So a person with no profile gets the two things the
 * seller needs from them, named.
 *
 * ── AND FOR THE ONES WE ALREADY KNOW, THE AGENT WRITES ─────────────────────
 *
 * Owner, the same night: "since we know each person's SOUL.md and their tasks
 * in the CRM, help each of them run the working day as productively as
 * possible, today included".
 *
 * A string template cannot do that, and pretending otherwise would produce a
 * plan made of adjectives. So this module does the two things code should do
 * -- collect WHAT WE HOLD about each person, and decide whether there is
 * anything to say at all -- and the words for a person whose SOUL and tasks
 * we have are written by the agent, which can read both. The brief below is
 * what it is given; it may add nothing that is not in it.
 */

export interface RoomPerson {
  /** Their own words about their own work -- the SOUL. Club members see it. */
  soul?: string | null
  /** Open items from the CRM for them, already worded for a person. */
  tasks?: string[]
  /** Telegram id, as a string. An id, never a name in the code's decisions. */
  id: string
  /** What the room calls them, for the line a human reads. */
  name?: string | null
  /**
   * Do we hold a seller profile for them (crm_client_profiles)?
   *
   * THREE STATES, AND THE THIRD IS THE POINT. `true` and `false` are answers;
   * `undefined` means NOBODY LOOKED, and a room post must not turn that into
   * "you have no profile" in front of everybody else. Every caller that
   * cannot answer leaves it out, and the line is simply not written.
   */
  hasProfile?: boolean
  /** Have they connected their own Telegram in the app? Same three states. */
  connected?: boolean
  /** Seconds since the epoch of their last message here, when known. */
  lastAt?: number | null
}

export interface DayPlanInput {
  people: RoomPerson[]
  /** Seconds since the epoch. Passed in: a planner that reads the clock
   *  cannot be tested at a boundary. */
  now: number
  /** Ids that are not clients: the owner himself, other bots. */
  skip?: string[]
}

/** How long a person may be silent before the plan stops naming them. */
export const QUIET_DAYS = 14

/**
 * WHAT MAY BE SAID IN A ROOM WHERE OTHER MEMBERS ARE READING.
 *
 * Owner, 2026-09-24: "this is a social business network, on this relation to
 * one another", and then, exactly: "SOUL is for the members of our social
 * network's club".
 *
 * So there are TWO kinds of knowing, and collapsing them is the whole danger:
 *
 *   SOUL -- what the person wrote about THEMSELVES. In a club it is their
 *   profile, not a dossier: the others can only help if they know what a
 *   person is working on. It is shared in the club room, and that sharing is
 *   the point of the room.
 *
 *   What they told the ASSISTANT -- a debt, a fear, what they are stuck on,
 *   money, a private question. Ours to act on, never ours to publish. A
 *   member did not tell the room; they told the helper.
 *
 * The first version of this function shared only the name, which was the
 * SAFE mistake: a club whose members cannot see each other's work is not a
 * network, it is a queue at one desk. This is the line, and it is in code
 * rather than in a prompt, because a prompt is a request and this is a rule.
 */
export interface SharedSelf {
  id: string
  name: string
  /** Their own words about their own work. Absent when they wrote none. */
  soul?: string
}

export function sharedSafe(p: PersonBrief): {
  shared: SharedSelf
  private: PersonBrief
} {
  const soul = String(p.soul ?? '').trim()
  return {
    shared: { id: p.id, name: p.name, ...(soul ? { soul } : {}) },
    private: p,
  }
}

/** What we hold about one person, as the brief hands it to the agent. */
export interface PersonBrief {
  id: string
  name: string
  /**
   * THEIR OWN WORDS ABOUT THEIR OWN WORK -- the SOUL, cut.
   *
   * Club members see this about each other: that is what makes the room a
   * network rather than a queue at one desk.
   */
  soul?: string | null
  /**
   * WHAT THE ASSISTANT KNOWS AND THE ROOM DOES NOT.
   *
   * Open items, debts, what somebody is stuck on. Goes to that person in
   * their own chat; `sharedSafe` never lets it into the post.
   */
  tasks?: string[]
}

/**
 * The brief for the people we DO know, and nothing about anybody else.
 *
 * Empty means the agent is not asked to write: a plan for a person we hold
 * nothing about is invention, and invention in front of the room is worse
 * than a quiet morning.
 */
export function briefFor(
  people: RoomPerson[],
  now: number,
  skip: string[] = []
): PersonBrief[] {
  const ignore = new Set(skip.map(String))
  return people
    .filter(p => p && p.id && !ignore.has(String(p.id)) && p.hasProfile)
    .filter(p => {
      const silentFor = p.lastAt ? (now - p.lastAt) / 86400 : null
      return silentFor === null || silentFor <= QUIET_DAYS
    })
    .filter(p => (p.soul ?? '').trim() || (p.tasks ?? []).length > 0)
    .map(p => ({
      id: String(p.id),
      name: String(p.name ?? '').trim() || `id ${p.id}`,
      ...((p.soul ?? '').trim() ? { soul: String(p.soul).slice(0, 600) } : {}),
      ...((p.tasks ?? []).length
        ? {
            tasks: (p.tasks as string[])
              .slice(0, 5)
              .map(t => String(t).slice(0, 200)),
          }
        : {}),
    }))
}

/** A person's line, or null when there is nothing true to say about them. */
export function lineFor(p: RoomPerson, now: number): string | null {
  const who = String(p.name ?? '').trim() || `id ${p.id}`
  const silentFor = p.lastAt ? (now - p.lastAt) / 86400 : null
  if (silentFor !== null && silentFor > QUIET_DAYS) return null
  /*
   * UNKNOWN IS NOT "NO", AND HERE IT IS SAID ABOUT SOMEBODY IN PUBLIC.
   *
   * These lines were `if (!p.hasProfile)`, which reads a field NOBODY FILLED
   * as the statement "they have no profile" -- and prints it in a room where
   * their colleagues are reading. The module never ran, so it never happened;
   * wiring it to a caller that could not answer one of these fields would
   * have made it happen on the first morning.
   *
   * The header of this file already says the rule ("it may say only what we
   * KNOW"); this is the rule in code. A field that is absent produces no
   * line, which is also the quiet the whole module is built around.
   */
  if (p.hasProfile === false)
    return (
      `• ${who} — профиля ещё нет. Чтобы начать: одно фото лица и одна фраза ` + // cyrillic-ok: user-facing
      'о том, чем занимаетесь. Больше не нужно.' // cyrillic-ok: user-facing
    )
  if (p.hasProfile === true && p.connected === false)
    return (
      `• ${who} — профиль есть, приложение не подключено. Откройте бота: ` + // cyrillic-ok: user-facing
      'там ваш план, память и портреты.' // cyrillic-ok: user-facing
    )
  return null
}

/**
 * The whole post, or null when the room should stay quiet.
 *
 * Null is the common case and that is deliberate: this speaks on the mornings
 * when something is actually missing.
 */
export function dayPlan(input: DayPlanInput): string | null {
  const skip = new Set((input.skip ?? []).map(String))
  const lines = input.people
    .filter(p => p && p.id && !skip.has(String(p.id)))
    .map(p => lineFor(p, input.now))
    .filter((l): l is string => Boolean(l))
  if (!lines.length) return null
  return (
    '☀️ План на день\n\n' + // cyrillic-ok: user-facing
    lines.join('\n') +
    '\n\nНапишите здесь, и я продолжу с каждым отдельно.' // cyrillic-ok: user-facing
  )
}
