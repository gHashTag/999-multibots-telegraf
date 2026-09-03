// Legacy VIBEE feed API. SAFE BETA keeps this artifact read-only even if it
// is deployed accidentally; the canonical product API lives in render/.

const express = require('express')
const { Pool } = require('pg')

const app = express()
const PORT = process.env.PORT || 8080
const SAFE_BETA_LOCKED = true
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
})

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Accept, Content-Type')
  res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')

  if (req.method === 'OPTIONS') return res.sendStatus(204)
  if (SAFE_BETA_LOCKED && req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(423).json({ error: 'SAFE_BETA_READ_ONLY' })
  }
  next()
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vibee-api', safeBeta: true })
})

app.get('/api/feed', async (req, res) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? '20'), 10)
    const requestedOffset = Number.parseInt(String(req.query.offset ?? '0'), 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 20
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0
    const search = String(req.query.search ?? '')
      .trim()
      .slice(0, 120)
    const orderBy =
      req.query.sort === 'likes' ? 'pt.likes_count DESC' : 'pt.created_at DESC'

    const result = await pool.query(
      `SELECT
         pt.id,
         pt.telegram_id,
         pt.creator_name,
         pt.creator_avatar,
         COALESCE(pt.creator_username, '') AS creator_username,
         pt.name,
         pt.description,
         pt.thumbnail_url,
         pt.video_url,
         pt.template_settings::text,
         pt.assets::text,
         pt.tracks::text,
         pt.likes_count,
         pt.views_count,
         pt.uses_count,
         pt.is_featured,
         pt.created_at::text,
         pt.parent_template_id,
         parent.creator_name AS original_creator_name,
         parent.creator_avatar AS original_creator_avatar
       FROM public_templates pt
       LEFT JOIN public_templates parent ON pt.parent_template_id = parent.id
       WHERE pt.is_public = TRUE
         AND pt.deleted_at IS NULL
         AND ($3 = '' OR pt.name ILIKE '%' || $3 || '%'
              OR pt.description ILIKE '%' || $3 || '%')
       ORDER BY ${orderBy}
       LIMIT $1 OFFSET $2`,
      [limit, offset, search]
    )

    const templates = result.rows.map(row => ({
      id: row.id,
      telegramId: row.telegram_id,
      creatorName: row.creator_name,
      creatorAvatar: row.creator_avatar,
      creatorUsername: row.creator_username,
      name: row.name,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      videoUrl: row.video_url,
      templateSettings: row.template_settings,
      assets: row.assets,
      tracks: row.tracks,
      likesCount: row.likes_count || 0,
      viewsCount: row.views_count || 0,
      usesCount: row.uses_count || 0,
      isLiked: false,
      isFeatured: row.is_featured || false,
      createdAt: row.created_at,
      parentTemplateId: row.parent_template_id,
      originalCreatorName: row.original_creator_name,
      originalCreatorAvatar: row.original_creator_avatar,
    }))

    res.json({ templates })
  } catch {
    res.status(500).json({ error: 'Failed to fetch feed' })
  }
})

app.get('/api/feed/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         pt.id,
         pt.telegram_id,
         pt.creator_name,
         pt.creator_avatar,
         COALESCE(pt.creator_username, '') AS creator_username,
         pt.name,
         pt.description,
         pt.thumbnail_url,
         pt.video_url,
         pt.template_settings::text,
         pt.assets::text,
         pt.tracks::text,
         pt.likes_count,
         pt.views_count,
         pt.uses_count,
         pt.is_featured,
         pt.created_at::text,
         pt.parent_template_id,
         parent.creator_name AS original_creator_name,
         parent.creator_avatar AS original_creator_avatar
       FROM public_templates pt
       LEFT JOIN public_templates parent ON pt.parent_template_id = parent.id
       WHERE pt.id = $1 AND pt.is_public = TRUE AND pt.deleted_at IS NULL`,
      [req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const row = result.rows[0]
    return res.json({
      id: row.id,
      telegramId: row.telegram_id,
      creatorName: row.creator_name,
      creatorAvatar: row.creator_avatar,
      creatorUsername: row.creator_username,
      name: row.name,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      videoUrl: row.video_url,
      templateSettings: row.template_settings,
      assets: row.assets,
      tracks: row.tracks,
      likesCount: row.likes_count || 0,
      viewsCount: row.views_count || 0,
      usesCount: row.uses_count || 0,
      isLiked: false,
      isFeatured: row.is_featured || false,
      createdAt: row.created_at,
      parentTemplateId: row.parent_template_id,
      originalCreatorName: row.original_creator_name,
      originalCreatorAvatar: row.original_creator_avatar,
    })
  } catch {
    return res.status(500).json({ error: 'Failed to fetch template' })
  }
})

app.listen(PORT, () => {
  console.log(`VIBEE read-only SAFE BETA API listening on port ${PORT}`)
})
