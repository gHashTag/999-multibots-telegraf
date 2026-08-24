import type { IncomingMessage } from 'node:http'
import { verifiedTelegramUser } from '../../auth'

export interface ProfilePool {
  query: (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Array<Record<string, unknown>> }>
}

export type OwnProfileResult =
  | { ok: false; status: 401 }
  | { ok: true; status: 200; profile: Record<string, unknown> }

const ensureProfiles = async (pool: ProfilePool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id bigserial PRIMARY KEY,
      telegram_id text UNIQUE NOT NULL,
      username text NOT NULL,
      display_name text NOT NULL,
      bio text,
      avatar_url text,
      cover_url text,
      social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
      is_public boolean NOT NULL DEFAULT TRUE,
      is_verified boolean NOT NULL DEFAULT FALSE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

/**
 * Create/load the active profile from signed Telegram fields only.
 * Request bodies, paths and query parameters never participate in ownership.
 */
export async function loadOrCreateOwnProfile(
  req: IncomingMessage,
  pool: ProfilePool
): Promise<OwnProfileResult> {
  const owner = verifiedTelegramUser(req)
  if (!owner) return { ok: false, status: 401 }

  await ensureProfiles(pool)
  const username = owner.username || `user_${owner.id}`
  const displayName = [owner.firstName, owner.lastName]
    .filter(Boolean)
    .join(' ')
  const userParams = [owner.id, username, displayName]
  const updatedUser = await pool.query(
    `UPDATE users
        SET username = $2, first_name = $3
      WHERE telegram_id = $1
      RETURNING id`,
    userParams
  )
  if (!updatedUser.rows.length) {
    await pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)`,
      userParams
    )
  }
  const result = await pool.query(
    `INSERT INTO profiles
       (telegram_id, username, display_name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE SET
       username = EXCLUDED.username,
       display_name = EXCLUDED.display_name,
       avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url)
     RETURNING id, telegram_id, username, display_name, bio, avatar_url,
       cover_url, social_links, is_public, is_verified, created_at::text`,
    [owner.id, username, displayName, owner.photoUrl || null]
  )
  const row = result.rows[0] || {}
  return {
    ok: true,
    status: 200,
    profile: {
      ...row,
      id: String(row.id ?? owner.id),
      telegram_id: String(row.telegram_id ?? owner.id),
      username: row.username ?? username,
      display_name: row.display_name ?? displayName,
      bio: row.bio ?? null,
      avatar_url: row.avatar_url ?? owner.photoUrl ?? null,
      cover_url: row.cover_url ?? null,
      social_links: row.social_links ?? [],
      is_public: row.is_public !== false,
      is_verified: row.is_verified === true,
      followers_count: 0,
      following_count: 0,
      templates_count: 0,
      total_views: 0,
      total_likes: 0,
      is_following: false,
      is_own_profile: true,
    },
  }
}
