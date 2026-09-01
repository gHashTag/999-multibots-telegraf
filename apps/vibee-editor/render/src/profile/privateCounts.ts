export interface PrivateProfileCounts {
  plan_count: number
  files_count: number
  skills_count: number
}

interface Queryable {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: Array<Record<string, unknown>> }>
}

function count(value: unknown): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

/**
 * Private workspace counters for the verified owner only.
 *
 * The caller owns the authorization boundary. A storage failure returns
 * `null`: the UI must hide an unknown badge rather than claim that the owner
 * has zero plans, files or skills.
 */
export async function loadPrivateProfileCounts(
  db: Queryable,
  telegramId: string
): Promise<PrivateProfileCounts | null> {
  try {
    const result = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM content_plan_goals WHERE telegram_id = $1) AS plan_count,
         (SELECT COUNT(*)::int FROM assets WHERE telegram_id = $1) AS files_count,
         (SELECT COUNT(*)::int FROM user_skills WHERE telegram_id = $1) AS skills_count`,
      [telegramId]
    )
    const row = result.rows[0]
    if (!row) return null
    return {
      plan_count: count(row.plan_count),
      files_count: count(row.files_count),
      skills_count: count(row.skills_count),
    }
  } catch {
    return null
  }
}

export async function loadVisiblePrivateProfileCounts(
  db: Queryable,
  profileTelegramId: string,
  verifiedViewerTelegramId: string | null | undefined
): Promise<PrivateProfileCounts | null> {
  if (
    !verifiedViewerTelegramId ||
    String(verifiedViewerTelegramId) !== String(profileTelegramId)
  ) {
    return null
  }
  return loadPrivateProfileCounts(db, profileTelegramId)
}
