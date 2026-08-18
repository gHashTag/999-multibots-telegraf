// VIBEE API Server - Feed endpoints
// Connects to Railway PostgreSQL

const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

// Railway PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:qBEYwMPQXqtDwabhOfNjHBOOmKKWEHKv@shinkansen.proxy.rlwy.net:39950/railway',
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'vibee-api', timestamp: new Date().toISOString() });
});

// GET /api/feed - Get public templates feed
app.get('/api/feed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const search = req.query.search || '';

    let searchFilter = '';
    if (search) {
      searchFilter = `AND (pt.name ILIKE '%${search}%' OR pt.description ILIKE '%${search}%')`;
    }

    const orderBy = req.query.sort === 'likes' ? 'pt.likes_count DESC' : 'pt.created_at DESC';

    const query = `
      SELECT
        pt.id,
        pt.telegram_id,
        pt.creator_name,
        pt.creator_avatar,
        COALESCE(pt.creator_username, '') as creator_username,
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
        CASE WHEN tl.user_id IS NOT NULL THEN TRUE ELSE FALSE END as is_liked,
        pt.is_featured,
        pt.created_at::text,
        pt.parent_template_id,
        parent.creator_name as original_creator_name,
        parent.creator_avatar as original_creator_avatar
      FROM public_templates pt
      LEFT JOIN template_likes tl ON pt.id = tl.template_id AND tl.user_id = $3
      LEFT JOIN public_templates parent ON pt.parent_template_id = parent.id
      WHERE pt.is_public = TRUE AND pt.deleted_at IS NULL ${searchFilter}
      ORDER BY ${orderBy}
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [limit, offset, userId]);

    // Transform rows to match frontend format
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
      isLiked: row.is_liked || false,
      isFeatured: row.is_featured || false,
      createdAt: row.created_at,
      parentTemplateId: row.parent_template_id,
      originalCreatorName: row.original_creator_name,
      originalCreatorAvatar: row.original_creator_avatar
    }));

    res.json({ templates });
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed', details: error.message });
  }
});

// GET /api/feed/:id - Get single template
app.get('/api/feed/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;

    const query = `
      SELECT
        pt.id,
        pt.telegram_id,
        pt.creator_name,
        pt.creator_avatar,
        COALESCE(pt.creator_username, '') as creator_username,
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
        CASE WHEN tl.user_id IS NOT NULL THEN TRUE ELSE FALSE END as is_liked,
        pt.is_featured,
        pt.created_at::text,
        pt.parent_template_id,
        parent.creator_name as original_creator_name,
        parent.creator_avatar as original_creator_avatar
      FROM public_templates pt
      LEFT JOIN template_likes tl ON pt.id = tl.template_id AND tl.user_id = $2
      LEFT JOIN public_templates parent ON pt.parent_template_id = parent.id
      WHERE pt.id = $1 AND pt.is_public = TRUE AND pt.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const row = result.rows[0];
    const template = {
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
      isLiked: row.is_liked || false,
      isFeatured: row.is_featured || false,
      createdAt: row.created_at,
      parentTemplateId: row.parent_template_id,
      originalCreatorName: row.original_creator_name,
      originalCreatorAvatar: row.original_creator_avatar
    };

    res.json(template);
  } catch (error) {
    console.error('Template error:', error);
    res.status(500).json({ error: 'Failed to fetch template', details: error.message });
  }
});

// POST /api/feed - Publish template to feed
app.post('/api/feed', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      telegram_id,
      creator_name,
      creator_avatar,
      name,
      description,
      thumbnail_url,
      video_url,
      template_settings,
      assets,
      tracks,
      parent_template_id,
      original_creator_id
    } = req.body;

    await client.query('BEGIN');

    const query = `
      INSERT INTO public_templates (
        telegram_id, creator_name, creator_avatar, name, description,
        thumbnail_url, video_url, template_settings, assets, tracks,
        parent_template_id, original_creator_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12)
      RETURNING id
    `;

    const result = await client.query(query, [
      telegram_id,
      creator_name || null,
      creator_avatar || null,
      name,
      description || null,
      thumbnail_url || null,
      video_url,
      JSON.stringify(template_settings || {}),
      JSON.stringify(assets || []),
      JSON.stringify(tracks || []),
      parent_template_id || null,
      original_creator_id || null
    ]);

    await client.query('COMMIT');

    res.status(201).json({ id: result.rows[0].id, message: 'Template published successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Publish error:', error);
    res.status(500).json({ error: 'Failed to publish template', details: error.message });
  } finally {
    client.release();
  }
});

// POST /api/feed/:id/like - Like/unlike template
app.post('/api/feed/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }

    // Check if already liked
    const existing = await pool.query(
      'SELECT * FROM template_likes WHERE template_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (existing.rows.length > 0) {
      // Unlike
      await pool.query('DELETE FROM template_likes WHERE template_id = $1 AND user_id = $2', [id, user_id]);
      await pool.query('UPDATE public_templates SET likes_count = likes_count - 1 WHERE id = $1', [id]);
      return res.json({ liked: false, message: 'Template unliked' });
    } else {
      // Like
      await pool.query('INSERT INTO template_likes (template_id, user_id) VALUES ($1, $2)', [id, user_id]);
      await pool.query('UPDATE public_templates SET likes_count = likes_count + 1 WHERE id = $1', [id]);
      return res.json({ liked: true, message: 'Template liked' });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like template', details: error.message });
  }
});

// POST /api/feed/:id/view - Track view
app.post('/api/feed/:id/view', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE public_templates SET views_count = views_count + 1 WHERE id = $1', [id]);
    res.json({ message: 'View tracked' });
  } catch (error) {
    console.error('View error:', error);
    res.status(500).json({ error: 'Failed to track view', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 VIBEE API Server listening on port ${PORT}`);
  console.log(`📡 Database: ${process.env.DATABASE_URL ? 'Railway PostgreSQL' : 'Default Railway'}`);
});
