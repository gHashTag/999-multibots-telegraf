type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>
}

const parsedLimit = Number(process.env.FREE_RENDER_LIMIT || 3)
export const FREE_RENDER_LIMIT =
  Number.isSafeInteger(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 3

function periodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function nextPeriod(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  ).toISOString()
}

export async function ensureRenderQuotaTable(pool: Pool): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS app_render_quota (
    telegram_id text NOT NULL,
    period_start date NOT NULL,
    used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (telegram_id, period_start)
  )`)
}

export async function readRenderQuota(
  pool: Pool,
  telegramId: string,
  isAdmin: boolean,
  now = new Date()
) {
  await ensureRenderQuotaTable(pool)
  const result = await pool.query(
    `SELECT used_count FROM app_render_quota
      WHERE telegram_id = $1 AND period_start = $2::date`,
    [telegramId, periodStart(now)]
  )
  const used = Math.max(0, Number(result.rows[0]?.used_count || 0))
  return {
    telegram_id: Number(telegramId),
    total_renders: used,
    free_remaining: isAdmin ? 0 : Math.max(0, FREE_RENDER_LIMIT - used),
    subscription: isAdmin
      ? {
          plan: 'owner',
          generations_limit: null,
          generations_used: used,
          remaining: null,
        }
      : null,
    reset_at: nextPeriod(now),
    is_admin: isAdmin,
  }
}

export async function reserveRenderQuota(
  pool: Pool,
  telegramId: string,
  isAdmin: boolean,
  now = new Date()
): Promise<{ allowed: boolean; used: number; periodStart: string | null }> {
  if (isAdmin) return { allowed: true, used: 0, periodStart: null }
  await ensureRenderQuotaTable(pool)
  const reservedPeriod = periodStart(now)
  const result = await pool.query(
    `INSERT INTO app_render_quota
       (telegram_id, period_start, used_count, updated_at)
     VALUES ($1, $2::date, 1, now())
     ON CONFLICT (telegram_id, period_start) DO UPDATE
       SET used_count = app_render_quota.used_count + 1, updated_at = now()
       WHERE app_render_quota.used_count < $3
     RETURNING used_count`,
    [telegramId, reservedPeriod, FREE_RENDER_LIMIT]
  )
  return {
    allowed: result.rows.length === 1,
    used: Number(result.rows[0]?.used_count || FREE_RENDER_LIMIT),
    periodStart: result.rows.length === 1 ? reservedPeriod : null,
  }
}

export async function refundRenderQuota(
  pool: Pool,
  telegramId: string,
  isAdmin: boolean,
  reservedPeriod: string | null
): Promise<void> {
  if (isAdmin || !reservedPeriod) return
  await pool.query(
    `UPDATE app_render_quota
        SET used_count = GREATEST(0, used_count - 1), updated_at = now()
      WHERE telegram_id = $1 AND period_start = $2::date`,
    [telegramId, reservedPeriod]
  )
}
