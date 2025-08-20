import express from 'express'
import { logger } from '@/utils/logger'
import { 
  getCompetitorSubscriptions,
  createCompetitorSubscription,
  updateCompetitorSubscription,
  deleteCompetitorSubscription,
  getSubscriptionById
} from '@/core/supabase/instagramDatabase'
import { 
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest 
} from '@/interfaces/instagram.interface'
import { generateInstagramScraping } from '@/services/generateInstagramScraping'
import { getUserProjects } from '@/core/supabase/getUserProjects'

const router = express.Router()

// ==========================================
// COMPETITOR SUBSCRIPTIONS API
// ==========================================

// GET /api/competitor-subscriptions - Получение подписок пользователя
router.get('/competitor-subscriptions', async (req, res) => {
  try {
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    logger.info('[Instagram API] Getting competitor subscriptions', {
      user_telegram_id,
      bot_name
    })

    const subscriptions = await getCompetitorSubscriptions(
      user_telegram_id as string,
      bot_name as string
    )

    const activeCount = subscriptions.filter(s => s.is_active).length
    const totalCount = subscriptions.length

    res.json({
      success: true,
      subscriptions,
      active_count: activeCount,
      total_count: totalCount
    })

  } catch (error) {
    logger.error('[Instagram API] Error getting competitor subscriptions', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to get competitor subscriptions'
    })
  }
})

// POST /api/competitor-subscriptions - Создание подписки
router.post('/competitor-subscriptions', async (req, res) => {
  const requestTimestamp = new Date().toISOString()
  
  logger.info('[Instagram API] 🚀 RECEIVED CREATE SUBSCRIPTION REQUEST', {
    timestamp: requestTimestamp,
    method: 'POST',
    endpoint: '/api/competitor-subscriptions',
    requestBody: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent']
    }
  })

  try {
    const {
      user_telegram_id,
      bot_name,
      competitor_username,
      max_reels = 10,
      min_views = 1000,
      max_age_days = 7,
      delivery_format = 'digest'
    }: CreateSubscriptionRequest = req.body

    logger.info('[Instagram API] 🔍 VALIDATING REQUEST PARAMETERS', {
      user_telegram_id,
      bot_name,
      competitor_username,
      max_reels,
      min_views,
      max_age_days,
      delivery_format
    })

    // Валидация обязательных полей
    if (!user_telegram_id || !bot_name || !competitor_username) {
      logger.warn('[Instagram API] ❌ VALIDATION FAILED - Missing required fields', {
        missingFields: {
          user_telegram_id: !user_telegram_id,
          bot_name: !bot_name,
          competitor_username: !competitor_username
        }
      })
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_telegram_id, bot_name, competitor_username'
      })
    }

    // Валидация username
    const usernameRegex = /^[a-zA-Z0-9._]{1,30}$/
    if (!usernameRegex.test(competitor_username)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram username format'
      })
    }

    // Валидация параметров
    if (max_reels < 1 || max_reels > 50) {
      return res.status(400).json({
        success: false,
        error: 'max_reels must be between 1 and 50'
      })
    }

    if (min_views < 0) {
      return res.status(400).json({
        success: false,
        error: 'min_views must be >= 0'
      })
    }

    if (max_age_days < 1 || max_age_days > 30) {
      return res.status(400).json({
        success: false,
        error: 'max_age_days must be between 1 and 30'
      })
    }

    if (!['digest', 'individual', 'archive'].includes(delivery_format)) {
      return res.status(400).json({
        success: false,
        error: 'delivery_format must be digest, individual, or archive'
      })
    }

    logger.info('[Instagram API] ✅ VALIDATION PASSED - Calling database function', {
      user_telegram_id,
      bot_name,
      competitor_username,
      parameters: {
        max_reels,
        min_views,
        max_age_days,
        delivery_format
      }
    })

    const subscription = await createCompetitorSubscription({
      user_telegram_id,
      bot_name,
      competitor_username,
      max_reels,
      min_views,
      max_age_days,
      delivery_format
    })

    if (!subscription) {
      logger.error('[Instagram API] ❌ DATABASE RETURNED NULL - Subscription creation failed', {
        user_telegram_id,
        bot_name,
        competitor_username,
        possibleReason: 'Maximum limit (10) reached or database error'
      })
      return res.status(409).json({
        success: false,
        error: 'Failed to create subscription. Maximum limit (10) may be reached.'
      })
    }

    logger.info('[Instagram API] ✅ SUBSCRIPTION CREATED SUCCESSFULLY - Sending response', {
      user_telegram_id,
      subscriptionId: subscription.id,
      competitor_username: subscription.competitor_username,
      responseData: {
        success: true,
        subscription_id: subscription.id,
        competitor_username: subscription.competitor_username,
        is_active: subscription.is_active,
        created_at: subscription.created_at
      }
    })

    res.status(201).json({
      success: true,
      subscription,
      message: 'Competitor subscription created successfully'
    })

  } catch (error) {
    logger.error('[Instagram API] Error creating competitor subscription', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to create competitor subscription'
    })
  }
})

// GET /api/competitor-subscriptions/:id - Получение одной подписки
router.get('/competitor-subscriptions/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    const subscription = await getSubscriptionById(
      id,
      user_telegram_id as string,
      bot_name as string
    )

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      })
    }

    res.json({
      success: true,
      subscription
    })

  } catch (error) {
    logger.error('[Instagram API] Error getting subscription by ID', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription'
    })
  }
})

// PUT /api/competitor-subscriptions/:id - Обновление подписки
router.put('/competitor-subscriptions/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { user_telegram_id, bot_name } = req.query
    const updates: UpdateSubscriptionRequest = req.body

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    // Валидация обновлений
    if (updates.max_reels !== undefined && (updates.max_reels < 1 || updates.max_reels > 50)) {
      return res.status(400).json({
        success: false,
        error: 'max_reels must be between 1 and 50'
      })
    }

    if (updates.min_views !== undefined && updates.min_views < 0) {
      return res.status(400).json({
        success: false,
        error: 'min_views must be >= 0'
      })
    }

    if (updates.max_age_days !== undefined && (updates.max_age_days < 1 || updates.max_age_days > 30)) {
      return res.status(400).json({
        success: false,
        error: 'max_age_days must be between 1 and 30'
      })
    }

    if (updates.delivery_format !== undefined && !['digest', 'individual', 'archive'].includes(updates.delivery_format)) {
      return res.status(400).json({
        success: false,
        error: 'delivery_format must be digest, individual, or archive'
      })
    }

    const subscription = await updateCompetitorSubscription(
      id,
      user_telegram_id as string,
      bot_name as string,
      updates
    )

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found or access denied'
      })
    }

    res.json({
      success: true,
      subscription,
      message: 'Subscription updated successfully'
    })

  } catch (error) {
    logger.error('[Instagram API] Error updating subscription', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to update subscription'
    })
  }
})

// DELETE /api/competitor-subscriptions/:id - Удаление подписки
router.delete('/competitor-subscriptions/:id', async (req, res) => {
  const requestTimestamp = new Date().toISOString()
  
  logger.info('[Instagram API] 🗑️ RECEIVED DELETE SUBSCRIPTION REQUEST', {
    timestamp: requestTimestamp,
    method: 'DELETE',
    endpoint: `/api/competitor-subscriptions/${req.params.id}`,
    subscriptionId: req.params.id,
    queryParams: req.query
  })

  try {
    const { id } = req.params
    const { user_telegram_id, bot_name } = req.query

    logger.info('[Instagram API] 🔍 VALIDATING DELETE PARAMETERS', {
      subscriptionId: id,
      user_telegram_id,
      bot_name
    })

    if (!user_telegram_id || !bot_name) {
      logger.warn('[Instagram API] ❌ DELETE VALIDATION FAILED - Missing parameters', {
        missing: {
          user_telegram_id: !user_telegram_id,
          bot_name: !bot_name
        }
      })
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    logger.info('[Instagram API] ✅ DELETE VALIDATION PASSED - Calling database function', {
      subscriptionId: id,
      user_telegram_id,
      bot_name
    })

    const deleted = await deleteCompetitorSubscription(
      id,
      user_telegram_id as string,
      bot_name as string
    )

    if (!deleted) {
      logger.warn('[Instagram API] ❌ DATABASE DELETION FAILED', {
        subscriptionId: id,
        user_telegram_id,
        bot_name,
        result: deleted,
        possibleReason: 'Subscription not found or access denied'
      })
      return res.status(404).json({
        success: false,
        error: 'Subscription not found or access denied'
      })
    }

    logger.info('[Instagram API] ✅ SUBSCRIPTION DELETED SUCCESSFULLY - Sending response', {
      subscriptionId: id,
      user_telegram_id,
      bot_name,
      deleted: true,
      responseData: {
        success: true,
        message: 'Subscription deleted successfully'
      }
    })

    res.json({
      success: true,
      message: 'Subscription deleted successfully'
    })

  } catch (error) {
    logger.error('[Instagram API] Error deleting subscription', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to delete subscription'
    })
  }
})

// ==========================================
// INSTAGRAM PARSING API
// ==========================================

// POST /api/instagram/parse - Запуск парсинга Instagram
router.post('/instagram/parse', async (req, res) => {
  try {
    const {
      username_or_id,
      project_id,
      max_users = 50,
      max_reels_per_user = 50,
      scrape_reels = false,
      requester_telegram_id,
      bot_name = 'default_bot'
    } = req.body

    // Валидация обязательных полей
    if (!username_or_id || !project_id || !requester_telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: username_or_id, project_id, requester_telegram_id'
      })
    }

    // Валидация username
    const cleanUsername = username_or_id.trim().replace('@', '')
    const usernameRegex = /^[a-zA-Z0-9._]{1,30}$/
    if (!usernameRegex.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram username format'
      })
    }

    // Валидация параметров
    if (max_users < 1 || max_users > 100) {
      return res.status(400).json({
        success: false,
        error: 'max_users must be between 1 and 100'
      })
    }

    if (max_reels_per_user < 1 || max_reels_per_user > 200) {
      return res.status(400).json({
        success: false,
        error: 'max_reels_per_user must be between 1 and 200'
      })
    }

    logger.info('[Instagram API] Starting Instagram parsing', {
      username_or_id: cleanUsername,
      project_id,
      max_users,
      scrape_reels,
      requester_telegram_id
    })

    // Создаем мок context для функции generateInstagramScraping
    const mockContext: any = {
      from: { id: parseInt(requester_telegram_id) },
      reply: async (text: string) => {
        logger.info('[Instagram API] Would send to user:', { text })
      },
      telegram: {
        sendChatAction: async () => {}
      },
      chat: { id: parseInt(requester_telegram_id) }
    }

    const result = await generateInstagramScraping(
      cleanUsername,
      project_id,
      max_users,
      max_reels_per_user,
      scrape_reels,
      requester_telegram_id,
      mockContext,
      bot_name
    )

    if (!result) {
      return res.status(500).json({
        success: false,
        error: 'Failed to start Instagram parsing'
      })
    }

    res.json(result)

  } catch (error) {
    logger.error('[Instagram API] Error starting Instagram parsing', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to start Instagram parsing'
    })
  }
})

// GET /api/instagram/projects - Получение проектов пользователя
router.get('/instagram/projects', async (req, res) => {
  try {
    const { user_telegram_id } = req.query

    if (!user_telegram_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: user_telegram_id'
      })
    }

    logger.info('[Instagram API] Getting user projects', {
      user_telegram_id
    })

    const projects = await getUserProjects(user_telegram_id as string)

    res.json({
      success: true,
      projects,
      total_count: projects.length
    })

  } catch (error) {
    logger.error('[Instagram API] Error getting user projects', { error })
    res.status(500).json({
      success: false,
      error: 'Failed to get user projects'
    })
  }
})

export default router