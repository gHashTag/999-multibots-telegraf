/**
 * FOLLOWING: THE HALF OF THE FEATURE THAT WAS NEVER WRITTEN.
 *
 * The player has had a complete follow client since before this file existed:
 * `followUserAtom` POSTs `/api/users/:username/follow`, `unfollowUserAtom`
 * DELETEs it, the profile has Followers and Following tabs, the iOS app decodes
 * `followers_count`, and a signed-out visitor who presses the button is shown a
 * login modal whose copy is "Sign in to follow".
 *
 * Nothing served any of it. `grep -n "/follow" render-server.ts` returned six
 * lines and all six were the literal `0` and `false` written into the profile
 * payload; a repo-wide search for a follow table returned nothing. The request
 * did not even 404 honestly -- `/api/users/` is a public prefix for GET only, so
 * the POST was refused as unauthorized before routing ever ran.
 *
 * So the button worked, the optimistic update painted +1, the request was
 * rejected, the atom reverted in silence, and the count went back to zero. The
 * number was never the lie -- nobody can have followers when following cannot be
 * recorded. The lie is the control, and the invitation to create an account in
 * order to reach it.
 *
 * WHY THIS IS A MODULE AND NOT TWENTY MORE LINES IN THE MONOLITH
 *
 * `render-server.ts` calls `main()` at import, so nothing in the test suite can
 * exercise a route over HTTP -- of 217 test files there, not one makes a
 * request. Logic left in that file can only ever be checked by reading its
 * source text. Its neighbour `privateCounts.ts` is the shape that can actually
 * be tested: a `Queryable` interface, a fake pool, and assertions on the SQL
 * that is issued. Follow lives here for the same reason.
 *
 * FAIL-CLOSED ON READS, BUT NOT FAIL-LOUD
 *
 * Reads never create the table and never throw: a storage failure answers
 * `null`, and the route keeps the zero it has always shown. The alternative --
 * letting a missing table escape -- would turn one hiccup into a 500 on every
 * profile page, web and iOS, for a counter nobody is waiting on.
 *
 * Writes are the opposite: they create the table inside their own try (the
 * house pattern -- see `template_stars` in render-server.ts) and report failure,
 * because a follow that silently does nothing is the defect this file exists to
 * remove.
 */

export interface Queryable {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>
}

export interface FollowCounts {
  followers_count: number
  following_count: number
  is_following: boolean
}

/**
 * One row of a followers/following list.
 *
 * No `telegram_id`. These routes sit under `/api/users/`, which `auth.ts` makes
 * public for GET, so anybody at all can read them -- and this file is not going
 * to hand out the identifier that `render-server.ts:10836` was patched to stop
 * leaking through the profile GET.
 *
 * `is_self` is computed from the VERIFIED viewer, not sent to the client as an
 * id to compare: it is the one bit the card needs ("do not offer me a Follow
 * button for myself") and it discloses nothing about anyone else.
 */
export interface FollowPerson {
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  is_following: boolean
  is_self: boolean
}

function count(value: unknown): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

function id(value: unknown): string {
  return String(value ?? '').trim()
}

/**
 * Create the table on the write path.
 *
 * NOT memoised. A module-level promise cache would remember a REJECTION for the
 * life of the process, and this repo has no migration runner to repair that --
 * every table here is created lazily by the handler that needs it.
 *
 * The CHECK is the honest place for "you cannot follow yourself": the callers
 * below refuse it first so the answer is a 400 rather than a constraint
 * violation, but a future caller that forgets still cannot write the row.
 */
export async function ensureFollowsTable(db: Queryable): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS user_follows (
       follower_id text NOT NULL,
       followee_id text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (follower_id, followee_id),
       CONSTRAINT user_follows_not_self CHECK (follower_id <> followee_id)
     )`
  )
  // The primary key already indexes (follower_id, followee_id), which answers
  // "who does X follow". "Who follows X" reads the second column first and
  // would otherwise scan the table.
  await db.query(
    `CREATE INDEX IF NOT EXISTS user_follows_followee_idx
       ON user_follows (followee_id, created_at DESC)`
  )
}

/**
 * Which telegram_id is behind this username.
 *
 * THREE ATTEMPTS, IN THE SAME ORDER AS THE PROFILE GET, AND FOR ITS REASON:
 * `profiles` may not exist on this database at all (render-server.ts:10334 says
 * so in as many words), and a creator who has only ever published templates has
 * no row there even when it does. A lookup that read `profiles` alone would
 * refuse to follow exactly the people whose profile pages render today.
 *
 * It is not shared with that handler because that one needs a different column
 * list per source in order to build a display card; this one needs one column.
 * What must not diverge is the ORDER and the case-insensitive match, and that is
 * why both are spelled out here rather than left to the reader.
 *
 * `deleted_at` appears only in the `public_templates` branch: `profiles` has no
 * such column, and naming it there is a guaranteed 500.
 */
export async function resolveUsernameToTelegramId(
  db: Queryable,
  username: string
): Promise<string | null> {
  const name = String(username ?? '').trim()
  if (!name) return null

  try {
    const r = await db.query(
      `SELECT telegram_id FROM profiles WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [name]
    )
    const found = id(r.rows[0]?.telegram_id)
    if (found) return found
  } catch {
    // profiles is optional on this database -- fall through.
  }

  try {
    const r = await db.query(
      `SELECT telegram_id FROM public_templates
        WHERE LOWER(creator_username) = LOWER($1) AND deleted_at IS NULL
        LIMIT 1`,
      [name]
    )
    const found = id(r.rows[0]?.telegram_id)
    if (found) return found
  } catch {
    // fall through
  }

  try {
    const r = await db.query(
      `SELECT telegram_id FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [name]
    )
    const found = id(r.rows[0]?.telegram_id)
    if (found) return found
  } catch {
    // fall through
  }

  return null
}

/**
 * Followers, following, and whether the viewer is one of them.
 *
 * `viewer` must be a VERIFIED id. Passing the `user_id` query parameter the old
 * client sent would let anybody ask "is 144022504 following this person" about
 * a stranger -- which is a fact about two other people.
 *
 * `null` means "could not read", not "zero": the caller decides what to show,
 * and today it shows the zero it has always shown.
 */
export async function loadFollowCounts(
  db: Queryable,
  telegramId: string,
  viewer: string | null | undefined
): Promise<FollowCounts | null> {
  const subject = id(telegramId)
  if (!subject) return null
  const who = id(viewer) || null
  try {
    const r = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM user_follows WHERE followee_id = $1) AS followers_count,
         (SELECT COUNT(*)::int FROM user_follows WHERE follower_id = $1) AS following_count,
         EXISTS (
           SELECT 1 FROM user_follows WHERE follower_id = $2 AND followee_id = $1
         ) AS is_following`,
      [subject, who]
    )
    const row = r.rows[0]
    if (!row) return null
    return {
      followers_count: count(row.followers_count),
      following_count: count(row.following_count),
      is_following: row.is_following === true,
    }
  } catch {
    return null
  }
}

/**
 * Record a follow. Idempotent: pressing the button twice is not an error, and
 * the client has an optimistic update that can race its own retry.
 *
 * Returns the counts AFTER the write so the client can replace its optimistic
 * `+1` with the truth. `null` means the write failed.
 */
export async function followPerson(
  db: Queryable,
  follower: string,
  followee: string
): Promise<FollowCounts | null> {
  const from = id(follower)
  const to = id(followee)
  if (!from || !to || from === to) return null
  try {
    await ensureFollowsTable(db)
    await db.query(
      `INSERT INTO user_follows (follower_id, followee_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [from, to]
    )
  } catch {
    return null
  }
  return loadFollowCounts(db, to, from)
}

/** Remove a follow. Also idempotent, for the same reason. */
export async function unfollowPerson(
  db: Queryable,
  follower: string,
  followee: string
): Promise<FollowCounts | null> {
  const from = id(follower)
  const to = id(followee)
  if (!from || !to) return null
  try {
    await ensureFollowsTable(db)
    await db.query(
      `DELETE FROM user_follows WHERE follower_id = $1 AND followee_id = $2`,
      [from, to]
    )
  } catch {
    return null
  }
  return loadFollowCounts(db, to, from)
}

export type FollowDirection = 'followers' | 'following'

interface ListOptions {
  page?: number
  limit?: number
}

/**
 * Who follows this person, or who this person follows.
 *
 * Two queries, not a join: the ids live in `user_follows`, the display fields
 * live in whichever of three tables the person happens to have a row in, and
 * `profiles` may not exist. Joining would make the list fail for everybody the
 * moment one optional table is absent.
 *
 * A person whose profile is marked `is_public = false` is NOT in the list. They
 * are still in the count -- a count is a number, a list is a set of names, and
 * only the second one tells you who somebody is. This route is unauthenticated.
 */
export async function listFollows(
  db: Queryable,
  telegramId: string,
  direction: FollowDirection,
  viewer: string | null | undefined,
  options: ListOptions = {}
): Promise<FollowPerson[] | null> {
  const subject = id(telegramId)
  if (!subject) return null
  const who = id(viewer) || null
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit ?? 20)))
  const page = Math.max(0, Math.floor(options.page ?? 0))
  const offset = page * limit

  // `followers` reads the followee column and returns followers; `following`
  // is the mirror. Column names are chosen here, never interpolated from input.
  const [subjectColumn, resultColumn] =
    direction === 'followers'
      ? ['followee_id', 'follower_id']
      : ['follower_id', 'followee_id']

  let ids: string[]
  try {
    const r = await db.query(
      `SELECT ${resultColumn} AS person
         FROM user_follows
        WHERE ${subjectColumn} = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [subject, limit, offset]
    )
    ids = r.rows.map(row => id(row.person)).filter(Boolean)
  } catch {
    return null
  }
  if (!ids.length) return []

  const cards = await describePeople(db, ids)
  const following = who ? await followedBy(db, who, ids) : new Set<string>()

  // Order by the follow order, not by whatever the display lookup returned.
  return ids
    .map(person => {
      const card = cards.get(person)
      if (!card) return null
      return {
        username: card.username,
        display_name: card.display_name,
        avatar_url: card.avatar_url,
        is_verified: card.is_verified,
        is_following: following.has(person),
        is_self: !!who && who === person,
      }
    })
    .filter((p): p is FollowPerson => p !== null)
}

interface PersonCard {
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
}

/**
 * Display fields for a page of ids, from whichever table has them.
 *
 * Earlier sources win, so `profiles` beats a template's creator columns. An id
 * that no source can name is dropped by the caller rather than rendered as a
 * blank card with a Follow button on it.
 */
async function describePeople(
  db: Queryable,
  ids: string[]
): Promise<Map<string, PersonCard>> {
  const found = new Map<string, PersonCard>()

  try {
    const r = await db.query(
      `SELECT telegram_id, username, display_name, avatar_url, is_verified, is_public
         FROM profiles
        WHERE telegram_id = ANY($1::text[])`,
      [ids]
    )
    for (const row of r.rows) {
      // A private profile is not listed. See the note on listFollows.
      if (row.is_public === false) continue
      const username = String(row.username ?? '').trim()
      if (!username) continue
      found.set(id(row.telegram_id), {
        username,
        display_name: (row.display_name as string) || null,
        avatar_url: (row.avatar_url as string) || null,
        is_verified: row.is_verified === true,
      })
    }
  } catch {
    // profiles is optional -- the fallbacks below still name most people.
  }

  const missing = ids.filter(person => !found.has(person))
  if (missing.length) {
    try {
      const r = await db.query(
        `SELECT DISTINCT ON (telegram_id)
                telegram_id, creator_username, creator_name, creator_avatar
           FROM public_templates
          WHERE telegram_id = ANY($1::text[])
            AND COALESCE(creator_username, '') <> ''
            AND deleted_at IS NULL`,
        [missing]
      )
      for (const row of r.rows) {
        const username = String(row.creator_username ?? '').trim()
        if (!username) continue
        found.set(id(row.telegram_id), {
          username,
          display_name: (row.creator_name as string) || null,
          avatar_url: (row.creator_avatar as string) || null,
          is_verified: false,
        })
      }
    } catch {
      // fall through
    }
  }

  const stillMissing = ids.filter(person => !found.has(person))
  if (stillMissing.length) {
    try {
      const r = await db.query(
        `SELECT telegram_id, username FROM users
          WHERE telegram_id = ANY($1::text[])
            AND COALESCE(username, '') <> ''`,
        [stillMissing]
      )
      for (const row of r.rows) {
        const username = String(row.username ?? '').trim()
        if (!username) continue
        found.set(id(row.telegram_id), {
          username,
          display_name: null,
          avatar_url: null,
          is_verified: false,
        })
      }
    } catch {
      // fall through
    }
  }

  return found
}

/** Which of these people the viewer already follows. Empty on any failure. */
async function followedBy(
  db: Queryable,
  viewer: string,
  ids: string[]
): Promise<Set<string>> {
  try {
    const r = await db.query(
      `SELECT followee_id FROM user_follows
        WHERE follower_id = $1 AND followee_id = ANY($2::text[])`,
      [viewer, ids]
    )
    return new Set(r.rows.map(row => id(row.followee_id)))
  } catch {
    return new Set<string>()
  }
}
