/**
 * WHICH PIECES OF A PERSON'S DIGITAL CLONE ARE ALREADY IN PLACE.
 *
 * The welcome road in the mini app decides where to start from SERVER FACTS,
 * never from a flag in localStorage: a member who paid is not shown the paywall
 * again, somebody with a SOUL is not asked to write one. Club membership and
 * the Telegram connection each have a status route for exactly that.
 *
 * The voice did not. `voiceAvatarWizard` in the bot creates an ElevenLabs voice
 * and writes `voice_id` onto the user row, and the avatar has been stored as
 * `photo_url` since registration -- but nothing outside the bot could ask
 * whether either exists, so the welcome could not have a step for them: a step
 * that cannot tell when it is done is a step that asks forever.
 *
 * WHAT THIS IS NOT. It does not create, clone or delete anything, and it
 * returns no identifiers -- only whether each piece is there. The voice id is a
 * key to somebody's synthesised voice at a provider; the answer to "is the
 * clone ready" does not need it, so it does not travel.
 */

export interface Queryable {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export const CLONE_PATHS = ['/api/clone/status'] as const

export function isClonePath(path: string): boolean {
  return (CLONE_PATHS as readonly string[]).includes(path)
}

export interface CloneDeps {
  getPool: () => Promise<Queryable>
  identity: (req: { url?: string; method?: string }) => string | null
}

/**
 * A row's column read as "is there anything here".
 *
 * Blank and whitespace count as absent, and so does the string "null" -- which
 * is what a column written by a script that interpolated a missing value looks
 * like, and a clone is not ready because somebody wrote four letters into it.
 */
export function present(value: unknown): boolean {
  if (typeof value !== 'string') return value !== null && value !== undefined
  const t = value.trim()
  return (
    t !== '' && t.toLowerCase() !== 'null' && t.toLowerCase() !== 'undefined'
  )
}

export async function handleClone(
  req: { url?: string; method?: string },
  deps: CloneDeps
): Promise<{ status: number; body: Record<string, unknown> }> {
  const path = (req.url || '').split('?')[0]
  if (!isClonePath(path)) return { status: 404, body: { ok: false } }
  if ((req.method || 'GET') !== 'GET') {
    return { status: 405, body: { ok: false, error: 'GET only' } }
  }

  const who = deps.identity(req)
  /*
   * NO ANONYMOUS ANSWER HERE, unlike the club's price.
   *
   * "Does this person have a voice" is about one person and nobody else, and an
   * anonymous default of `false` would be worse than a refusal: the welcome
   * would read it as a real fact and ask a signed-out visitor to record a voice
   * they may already have.
   */
  if (!who) {
    return {
      status: 401,
      body: {
        ok: false,
        error: 'нужна подпись, сессия приложения или ключ агента',
      }, // cyrillic-ok: user-facing error
    }
  }
  if (/^-/.test(who)) {
    return {
      status: 400,
      body: { ok: false, error: 'клон принадлежит человеку, не чату' },
    } // cyrillic-ok: user-facing error
  }

  try {
    const pool = await deps.getPool()
    /*
     * `SELECT *` FOR ONE ROW, ON PURPOSE.
     *
     * The voice lives in `voice_id_elevenlabs` (updateUserVoice.ts) and newer
     * code says `voice_id`. Naming either column explicitly makes this route
     * fail entirely -- 503 on every call -- the day that column is renamed or
     * does not exist in an environment, and a readiness check that always says
     * "unknown" is worse than none. One row is cheap; nothing but booleans
     * leaves this function.
     */
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE telegram_id = $1 LIMIT 1`,
      [who]
    )
    const row = rows[0]
    if (!row) {
      /*
       * A person the app knows and the users table does not is not an error:
       * they signed in and have not been created yet. Every piece is simply
       * absent, which is the truth and lets the welcome start at step one.
       */
      return { status: 200, body: { ok: true, voice: false, photo: false } }
    }
    return {
      status: 200,
      body: {
        ok: true,
        // Two column names for one thing: the older wizard writes
        // `voice_id_elevenlabs`, newer code `voice_id`. Either counts -- a
        // person whose voice exists must not be asked to record it again
        // because it was stored under the name this route did not know.
        voice: present(row.voice_id_elevenlabs) || present(row.voice_id),
        photo: present(row.photo_url),
      },
    }
  } catch (e) {
    /*
     * A database that is briefly unreachable must not be reported as "the
     * clone is empty": the welcome would send somebody to redo work they have
     * already done. Say the answer is unknown and let the caller keep its
     * current picture.
     */
    return {
      status: 503,
      body: {
        ok: false,
        error: 'не удалось прочитать состояние клона', // cyrillic-ok: user-facing error
        detail: e instanceof Error ? e.message.slice(0, 120) : undefined,
      },
    }
  }
}
