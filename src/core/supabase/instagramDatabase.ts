import { logger } from '@/utils/logger'
import { queryNeon } from '../neon/client'
import { 
  ValidatedInstagramUser, 
  InstagramReel, 
  CompetitorSubscription,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest 
} from '@/interfaces/instagram.interface'
import { generateUuidV4 } from '@/utils/generateUuidV4'

// ==========================================
// INSTAGRAM USERS FUNCTIONS
// ==========================================

export async function saveInstagramUsers(
  projectId: number,
  users: ValidatedInstagramUser[],
  targetUsername: string
): Promise<void> {
  logger.info('[Instagram DB] Saving Instagram users to database', {
    projectId,
    usersCount: users.length,
    targetUsername
  })

  for (const user of users) {
    try {
      await queryNeon(
        `
        INSERT INTO instagram_similar_users (
          instagram_user_id, 
          username, 
          full_name, 
          followers_count, 
          following_count, 
          media_count,
          is_verified, 
          is_private, 
          profile_pic_url, 
          bio, 
          external_url, 
          category,
          is_business_account,
          similarity_score,
          project_id,
          target_username,
          analysis_metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        ON CONFLICT (instagram_user_id, project_id) 
        DO UPDATE SET
          username = EXCLUDED.username,
          full_name = EXCLUDED.full_name,
          followers_count = EXCLUDED.followers_count,
          following_count = EXCLUDED.following_count,
          media_count = EXCLUDED.media_count,
          is_verified = EXCLUDED.is_verified,
          is_private = EXCLUDED.is_private,
          profile_pic_url = EXCLUDED.profile_pic_url,
          bio = EXCLUDED.bio,
          external_url = EXCLUDED.external_url,
          category = EXCLUDED.category,
          is_business_account = EXCLUDED.is_business_account,
          similarity_score = EXCLUDED.similarity_score,
          analysis_metadata = EXCLUDED.analysis_metadata,
          updated_at = NOW()
        `,
        [
          user.id,
          user.username,
          user.full_name,
          user.followers_count,
          user.following_count,
          user.media_count,
          user.is_verified,
          user.is_private,
          user.profile_pic_url || null,
          user.bio || null,
          user.external_url || null,
          user.category || null,
          user.is_business_account || false,
          user.similarity_score || null,
          projectId,
          targetUsername,
          JSON.stringify(user.analysis_metadata || {})
        ]
      )
    } catch (error) {
      logger.error('[Instagram DB] Error saving Instagram user', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
        username: user.username
      })
    }
  }

  logger.info('[Instagram DB] Successfully saved Instagram users', {
    projectId,
    usersCount: users.length
  })
}

export async function saveInstagramReels(
  userId: string,
  reels: InstagramReel[],
  projectId: number
): Promise<void> {
  logger.info('[Instagram DB] Saving Instagram reels to database', {
    userId,
    reelsCount: reels.length,
    projectId
  })

  for (const reel of reels) {
    try {
      await queryNeon(
        `
        INSERT INTO instagram_user_reels (
          reel_id,
          shortcode,
          instagram_user_id,
          caption,
          media_url,
          thumbnail_url,
          video_duration,
          view_count,
          like_count,
          comment_count,
          created_at,
          hashtags,
          mentions,
          project_id,
          scraped_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (reel_id, project_id) 
        DO UPDATE SET
          caption = EXCLUDED.caption,
          media_url = EXCLUDED.media_url,
          thumbnail_url = EXCLUDED.thumbnail_url,
          video_duration = EXCLUDED.video_duration,
          view_count = EXCLUDED.view_count,
          like_count = EXCLUDED.like_count,
          comment_count = EXCLUDED.comment_count,
          hashtags = EXCLUDED.hashtags,
          mentions = EXCLUDED.mentions,
          scraped_at = NOW()
        `,
        [
          reel.id,
          reel.shortcode,
          reel.user_id,
          reel.caption || null,
          reel.media_url,
          reel.thumbnail_url || null,
          reel.video_duration || null,
          reel.view_count || null,
          reel.like_count || null,
          reel.comment_count || null,
          reel.created_at,
          JSON.stringify(reel.hashtags || []),
          JSON.stringify(reel.mentions || []),
          projectId
        ]
      )
    } catch (error) {
      logger.error('[Instagram DB] Error saving Instagram reel', {
        error: error instanceof Error ? error.message : String(error),
        reelId: reel.id,
        userId: userId
      })
    }
  }

  logger.info('[Instagram DB] Successfully saved Instagram reels', {
    userId,
    reelsCount: reels.length,
    projectId
  })
}

// ==========================================
// COMPETITOR SUBSCRIPTIONS FUNCTIONS
// ==========================================

export async function getCompetitorSubscriptions(
  userTelegramId: string,
  botName: string
): Promise<CompetitorSubscription[]> {
  logger.info('[Instagram DB] Getting competitor subscriptions', {
    userTelegramId,
    botName
  })

  try {
    const result = await queryNeon(
      `
      SELECT 
        id,
        user_telegram_id,
        bot_name,
        competitor_username,
        max_reels,
        min_views,
        max_age_days,
        delivery_format,
        is_active,
        created_at,
        updated_at,
        last_parsed_at as last_delivery
      FROM competitor_subscriptions
      WHERE user_telegram_id = $1 AND bot_name = $2
      ORDER BY created_at DESC
      `,
      [userTelegramId, botName]
    )

    logger.info('[Instagram DB] Found competitor subscriptions', {
      userTelegramId,
      botName,
      count: result.rows.length
    })

    return result.rows.map(row => ({
      id: row.id,
      user_telegram_id: row.user_telegram_id,
      bot_name: row.bot_name,
      competitor_username: row.competitor_username,
      max_reels: row.max_reels,
      min_views: row.min_views,
      max_age_days: row.max_age_days,
      delivery_format: row.delivery_format,
      is_active: row.is_active,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_delivery: row.last_delivery ? new Date(row.last_delivery) : undefined
    }))
  } catch (error) {
    logger.error('[Instagram DB] Error getting competitor subscriptions', {
      error: error instanceof Error ? error.message : String(error),
      userTelegramId,
      botName
    })
    return []
  }
}

export async function createCompetitorSubscription(
  request: CreateSubscriptionRequest
): Promise<CompetitorSubscription | null> {
  logger.info('[Instagram DB] Creating competitor subscription', {
    userTelegramId: request.user_telegram_id,
    competitorUsername: request.competitor_username,
    botName: request.bot_name
  })

  // Проверяем лимит активных подписок (максимум 10)
  const activeCount = await queryNeon(
    `
    SELECT COUNT(*) as count 
    FROM competitor_subscriptions 
    WHERE user_telegram_id = $1 AND bot_name = $2 AND is_active = true
    `,
    [request.user_telegram_id, request.bot_name]
  )

  if (parseInt(activeCount.rows[0].count) >= 10) {
    logger.warn('[Instagram DB] User has reached maximum active subscriptions limit', {
      userTelegramId: request.user_telegram_id,
      activeCount: activeCount.rows[0].count
    })
    return null
  }

  try {
    const subscriptionId = generateUuidV4()
    
    const result = await queryNeon(
      `
      INSERT INTO competitor_subscriptions (
        id,
        user_telegram_id,
        bot_name,
        competitor_username,
        max_reels,
        min_views,
        max_age_days,
        delivery_format,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
      RETURNING *
      `,
      [
        subscriptionId,
        request.user_telegram_id,
        request.bot_name,
        request.competitor_username,
        request.max_reels,
        request.min_views,
        request.max_age_days,
        request.delivery_format
      ]
    )

    const row = result.rows[0]
    
    logger.info('[Instagram DB] Successfully created competitor subscription', {
      subscriptionId: row.id,
      userTelegramId: request.user_telegram_id,
      competitorUsername: request.competitor_username
    })

    return {
      id: row.id,
      user_telegram_id: row.user_telegram_id,
      bot_name: row.bot_name,
      competitor_username: row.competitor_username,
      max_reels: row.max_reels,
      min_views: row.min_views,
      max_age_days: row.max_age_days,
      delivery_format: row.delivery_format,
      is_active: row.is_active,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_delivery: row.last_delivery ? new Date(row.last_delivery) : undefined
    }
  } catch (error) {
    logger.error('[Instagram DB] Error creating competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      userTelegramId: request.user_telegram_id,
      competitorUsername: request.competitor_username
    })
    return null
  }
}

export async function updateCompetitorSubscription(
  subscriptionId: string,
  userTelegramId: string,
  botName: string,
  updates: UpdateSubscriptionRequest
): Promise<CompetitorSubscription | null> {
  logger.info('[Instagram DB] Updating competitor subscription', {
    subscriptionId,
    userTelegramId,
    updates
  })

  try {
    const setParts: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (updates.max_reels !== undefined) {
      setParts.push(`max_reels = $${paramIndex++}`)
      values.push(updates.max_reels)
    }

    if (updates.min_views !== undefined) {
      setParts.push(`min_views = $${paramIndex++}`)
      values.push(updates.min_views)
    }

    if (updates.max_age_days !== undefined) {
      setParts.push(`max_age_days = $${paramIndex++}`)
      values.push(updates.max_age_days)
    }

    if (updates.delivery_format !== undefined) {
      setParts.push(`delivery_format = $${paramIndex++}`)
      values.push(updates.delivery_format)
    }

    if (updates.is_active !== undefined) {
      setParts.push(`is_active = $${paramIndex++}`)
      values.push(updates.is_active)
    }

    if (setParts.length === 0) {
      logger.warn('[Instagram DB] No updates provided for subscription', {
        subscriptionId
      })
      return null
    }

    setParts.push(`updated_at = NOW()`)

    values.push(subscriptionId, userTelegramId, botName)

    const result = await queryNeon(
      `
      UPDATE competitor_subscriptions 
      SET ${setParts.join(', ')}
      WHERE id = $${paramIndex++} 
        AND user_telegram_id = $${paramIndex++} 
        AND bot_name = $${paramIndex++}
      RETURNING *
      `,
      values
    )

    if (result.rows.length === 0) {
      logger.warn('[Instagram DB] Subscription not found or access denied', {
        subscriptionId,
        userTelegramId,
        botName
      })
      return null
    }

    const row = result.rows[0]

    logger.info('[Instagram DB] Successfully updated competitor subscription', {
      subscriptionId: row.id,
      userTelegramId: row.user_telegram_id,
      updates
    })

    return {
      id: row.id,
      user_telegram_id: row.user_telegram_id,
      bot_name: row.bot_name,
      competitor_username: row.competitor_username,
      max_reels: row.max_reels,
      min_views: row.min_views,
      max_age_days: row.max_age_days,
      delivery_format: row.delivery_format,
      is_active: row.is_active,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_delivery: row.last_delivery ? new Date(row.last_delivery) : undefined
    }
  } catch (error) {
    logger.error('[Instagram DB] Error updating competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      subscriptionId,
      userTelegramId
    })
    return null
  }
}

export async function deleteCompetitorSubscription(
  subscriptionId: string,
  userTelegramId: string,
  botName: string
): Promise<boolean> {
  logger.info('[Instagram DB] Deleting competitor subscription', {
    subscriptionId,
    userTelegramId,
    botName
  })

  try {
    const result = await queryNeon(
      `
      DELETE FROM competitor_subscriptions
      WHERE id = $1 AND user_telegram_id = $2 AND bot_name = $3
      `,
      [subscriptionId, userTelegramId, botName]
    )

    const deleted = result.rowCount && result.rowCount > 0

    if (deleted) {
      logger.info('[Instagram DB] Successfully deleted competitor subscription', {
        subscriptionId,
        userTelegramId
      })
    } else {
      logger.warn('[Instagram DB] Subscription not found or access denied', {
        subscriptionId,
        userTelegramId,
        botName
      })
    }

    return deleted
  } catch (error) {
    logger.error('[Instagram DB] Error deleting competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      subscriptionId,
      userTelegramId
    })
    return false
  }
}

export async function getSubscriptionById(
  subscriptionId: string,
  userTelegramId: string,
  botName: string
): Promise<CompetitorSubscription | null> {
  try {
    const result = await queryNeon(
      `
      SELECT 
        id,
        user_telegram_id,
        bot_name,
        competitor_username,
        max_reels,
        min_views,
        max_age_days,
        delivery_format,
        is_active,
        created_at,
        updated_at,
        last_parsed_at as last_delivery
      FROM competitor_subscriptions
      WHERE id = $1 AND user_telegram_id = $2 AND bot_name = $3
      `,
      [subscriptionId, userTelegramId, botName]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]

    return {
      id: row.id,
      user_telegram_id: row.user_telegram_id,
      bot_name: row.bot_name,
      competitor_username: row.competitor_username,
      max_reels: row.max_reels,
      min_views: row.min_views,
      max_age_days: row.max_age_days,
      delivery_format: row.delivery_format,
      is_active: row.is_active,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_delivery: row.last_delivery ? new Date(row.last_delivery) : undefined
    }
  } catch (error) {
    logger.error('[Instagram DB] Error getting subscription by ID', {
      error: error instanceof Error ? error.message : String(error),
      subscriptionId,
      userTelegramId,
      botName
    })
    return null
  }
}