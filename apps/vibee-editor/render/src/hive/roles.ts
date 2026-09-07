/**
 * HIVE ROLES -- THE ONE PLACE THAT ANSWERS "WHAT MAY THIS PERSON SEE".
 *
 * Owner, 2026-09-07: "the main thing is that it is safe for everyone; clients
 * must not know about other clients; only admins or super-admins; work out the
 * roles in our hive".
 *
 * WHY THIS IS URGENT RATHER THAN TIDY
 *
 * Measured 2026-09-07: the `users` table in Supabase is ONE TABLE FOR THE WHOLE
 * PLATFORM -- 2380 people belonging to all sixteen bot owners. The separation is
 * NOT in storage but at read time: every query is itself responsible for not
 * forgetting the `bot_name` filter. While that rule lives in people's heads and
 * is repeated at every call site, one forgotten line means a client saw other
 * clients.
 *
 * Here the rule is written ONCE and checked by tests. Everything that reads
 * other people's data must ask this module.
 *
 * THREE ROLES, AND THE BORDER BETWEEN THEM
 *
 *   bee    -- an ordinary person. Sees THEMSELVES and nothing else. Not the
 *             count of neighbours, not their names, not even how many people
 *             are in the hive at all.
 *
 *   owner  -- someone with bots in `avatars`. Sees their bots and the people of
 *             THOSE bots. Sees neither other owners, nor their revenue, nor
 *             their clients -- not even in aggregate: "2380 platform-wide"
 *             already tells them about other people's.
 *
 *   keeper -- the super-admin. Sees the whole farm: income and loss per bot.
 *             This is the only role for which "everything" exists.
 *
 * WHY OWNERSHIP COMES FROM `avatars` AND NOT FROM A NEW LIST
 *
 * `getOwnedBots`, owner notifications and billing already stand on `avatars`. A
 * second source of ownership would drift from the first, and the drift would
 * show up as "I cannot see my own bot" or, worse, "I can see somebody else's".
 *
 * FAIL-CLOSED
 *
 * If we cannot work out who is asking, or whose the bots are -- REFUSE, do not
 * "show everything". The opposite choice in a system with one shared table
 * means a leak on the first network hiccup.
 */

export type Role = 'bee' | 'owner' | 'keeper'

/**
 * Who keeps the hive.
 *
 * A list, not a single id: a platform may have more than one responsible
 * person, and the second one, added "temporarily" in code, stays there forever.
 *
 * Empty in the environment means there is NO keeper, and the role is granted to
 * nobody. That is deliberate: a missing setting must not silently appoint
 * somebody in charge.
 */
export function keepers(): string[] {
  return (process.env.HIVE_KEEPERS || process.env.OWNER_TELEGRAM_ID || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export interface OwnershipSource {
  /** This person's bots according to `avatars`. An empty list means none. */
  botsOwnedBy(telegramId: string): Promise<string[]>
}

/**
 * What a person may see.
 *
 * `bots: null` means "the whole farm" and is reachable ONLY by a keeper.
 * `bots: []` means "nothing": a bee has no access to other people's data at all.
 */
export interface Visibility {
  role: Role
  who: string
  /** null = the whole farm (keeper only); otherwise an exact list of bots. */
  bots: string[] | null
}

/**
 * Work out the role and the scope.
 *
 * `who` must arrive from a VERIFIED identity (a Mini App signature, a session,
 * an agent key). An id from a request body is useless and dangerous here: it
 * states who the caller would like to appear to be.
 */
export async function visibilityOf(
  who: string | null | undefined,
  source: OwnershipSource
): Promise<Visibility> {
  const id = String(who ?? '').trim()
  // An unidentified caller gets NOTHING. Not "the public part", not "a summary"
  // -- nothing: a platform summary also tells them about other people.
  if (!id) return { role: 'bee', who: '', bots: [] }

  if (keepers().includes(id)) {
    return { role: 'keeper', who: id, bots: null }
  }

  let bots: string[]
  try {
    bots = await source.botsOwnedBy(id)
  } catch {
    // We could not establish ownership -- treat it as absent. The opposite
    // choice would turn any database hiccup into a leak.
    bots = []
  }

  return bots.length
    ? { role: 'owner', who: id, bots }
    : { role: 'bee', who: id, bots: [] }
}

/**
 * May this person see THIS bot's data.
 *
 * A separate function because the "is this bot mine" check repeats in every
 * read, and repeated by hand it will one day be forgotten.
 */
export function canSeeBot(v: Visibility, botName: string): boolean {
  if (v.role === 'keeper') return true
  const name = String(botName || '').trim()
  return !!name && v.bots !== null && v.bots.includes(name)
}

/**
 * May this person see THAT person's data.
 *
 * Yourself, always. Somebody else, keeper only: even a bot owner must not read
 * an arbitrary profile by id, otherwise the "my clients" border is walked
 * around by counting upwards.
 */
export function canSeePerson(v: Visibility, telegramId: string): boolean {
  if (v.role === 'keeper') return true
  return String(telegramId || '').trim() === v.who && v.who !== ''
}

/**
 * The SQL/PostgREST condition for selecting "only what is visible".
 *
 * Returns `null` when there is nothing to restrict by (a keeper), and an EMPTY
 * list of bots when there is nothing to see. The caller must tell the two
 * apart: `null` and `[]` are opposites here, and confusing them means showing
 * everything instead of nothing.
 */
export function botFilter(v: Visibility): string[] | null {
  return v.role === 'keeper' ? null : (v.bots ?? [])
}
