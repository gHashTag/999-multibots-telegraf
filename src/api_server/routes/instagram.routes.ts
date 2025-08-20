import { Router, Request, Response } from 'express'
import { logger } from '@/utils/logger'
import { 
  getCompetitorSubscriptions,
  createCompetitorSubscription,
  updateCompetitorSubscription,
  deleteCompetitorSubscription,
  getSubscriptionById
} from '@/core/supabase/instagramDatabase'
import { 
  CreateSubscriptionSchema, 
  UpdateSubscriptionSchema,
  validateInstagramUsername
} from '@/core/validation/instagramSchemas'
import { 
  SubscriptionsResponse,
  SubscriptionResponse,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest 
} from '@/interfaces/instagram.interface'

const router = Router()

// ==========================================
// GET /api/competitor-subscriptions
// Получение подписок пользователя
// ==========================================
router.get('/competitor-subscriptions', async (req: Request, res: Response) => {
  try {
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    logger.info('[Instagram API] Getting competitor subscriptions', {
      userTelegramId: user_telegram_id,
      botName: bot_name
    })

    const subscriptions = await getCompetitorSubscriptions(
      user_telegram_id as string,
      bot_name as string
    )

    const activeCount = subscriptions.filter(sub => sub.is_active).length

    const response: SubscriptionsResponse = {
      success: true,
      subscriptions,
      total_count: subscriptions.length,
      active_count: activeCount
    }

    logger.info('[Instagram API] Retrieved competitor subscriptions', {
      userTelegramId: user_telegram_id,
      totalCount: subscriptions.length,
      activeCount
    })

    res.json(response)
  } catch (error) {
    logger.error('[Instagram API] Error getting competitor subscriptions', {
      error: error instanceof Error ? error.message : String(error),
      userTelegramId: req.query.user_telegram_id,
      botName: req.query.bot_name
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching subscriptions'
    })
  }
})

// ==========================================
// POST /api/competitor-subscriptions
// Создание подписки на конкурента
// ==========================================
router.post('/competitor-subscriptions', async (req: Request, res: Response) => {
  try {
    logger.info('[Instagram API] Creating competitor subscription', {
      body: req.body
    })

    // Валидация данных с помощью Zod
    const validation = CreateSubscriptionSchema.safeParse(req.body)
    
    if (!validation.success) {
      logger.warn('[Instagram API] Invalid subscription data', {
        errors: validation.error.errors,
        body: req.body
      })

      return res.status(400).json({
        success: false,
        error: 'Invalid subscription data',
        details: validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      })
    }

    const validatedData: CreateSubscriptionRequest = validation.data

    // Дополнительная проверка username
    if (!validateInstagramUsername(validatedData.competitor_username)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Instagram username format'
      })
    }

    const subscription = await createCompetitorSubscription(validatedData)

    if (!subscription) {
      logger.warn('[Instagram API] Failed to create subscription - likely hit limit', {
        userTelegramId: validatedData.user_telegram_id,
        competitorUsername: validatedData.competitor_username
      })

      const response: SubscriptionResponse = {
        success: false,
        error: 'Failed to create subscription. You may have reached the maximum limit of 10 active subscriptions.'
      }

      return res.status(409).json(response)
    }

    logger.info('[Instagram API] Successfully created competitor subscription', {
      subscriptionId: subscription.id,
      userTelegramId: subscription.user_telegram_id,
      competitorUsername: subscription.competitor_username
    })

    const response: SubscriptionResponse = {
      success: true,
      subscription,
      message: 'Subscription created successfully'
    }

    res.status(201).json(response)
  } catch (error) {
    logger.error('[Instagram API] Error creating competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      body: req.body
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error while creating subscription'
    })
  }
})

// ==========================================
// PUT /api/competitor-subscriptions/:id
// Обновление параметров подписки
// ==========================================
router.put('/competitor-subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    logger.info('[Instagram API] Updating competitor subscription', {
      subscriptionId: id,
      userTelegramId: user_telegram_id,
      botName: bot_name,
      body: req.body
    })

    // Валидация данных обновления
    const validation = UpdateSubscriptionSchema.safeParse(req.body)
    
    if (!validation.success) {
      logger.warn('[Instagram API] Invalid update data', {
        errors: validation.error.errors,
        body: req.body
      })

      return res.status(400).json({
        success: false,
        error: 'Invalid update data',
        details: validation.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      })
    }

    const updates: UpdateSubscriptionRequest = validation.data

    const updatedSubscription = await updateCompetitorSubscription(
      id,
      user_telegram_id as string,
      bot_name as string,
      updates
    )

    if (!updatedSubscription) {
      logger.warn('[Instagram API] Subscription not found or access denied', {
        subscriptionId: id,
        userTelegramId: user_telegram_id,
        botName: bot_name
      })

      const response: SubscriptionResponse = {
        success: false,
        error: 'Subscription not found or access denied'
      }

      return res.status(404).json(response)
    }

    logger.info('[Instagram API] Successfully updated competitor subscription', {
      subscriptionId: updatedSubscription.id,
      userTelegramId: updatedSubscription.user_telegram_id,
      updates
    })

    const response: SubscriptionResponse = {
      success: true,
      subscription: updatedSubscription,
      message: 'Subscription updated successfully'
    }

    res.json(response)
  } catch (error) {
    logger.error('[Instagram API] Error updating competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      subscriptionId: req.params.id,
      userTelegramId: req.query.user_telegram_id,
      body: req.body
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error while updating subscription'
    })
  }
})

// ==========================================
// DELETE /api/competitor-subscriptions/:id
// Удаление подписки
// ==========================================
router.delete('/competitor-subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    logger.info('[Instagram API] Deleting competitor subscription', {
      subscriptionId: id,
      userTelegramId: user_telegram_id,
      botName: bot_name
    })

    const deleted = await deleteCompetitorSubscription(
      id,
      user_telegram_id as string,
      bot_name as string
    )

    if (!deleted) {
      logger.warn('[Instagram API] Subscription not found or access denied for deletion', {
        subscriptionId: id,
        userTelegramId: user_telegram_id,
        botName: bot_name
      })

      const response: SubscriptionResponse = {
        success: false,
        error: 'Subscription not found or access denied'
      }

      return res.status(404).json(response)
    }

    logger.info('[Instagram API] Successfully deleted competitor subscription', {
      subscriptionId: id,
      userTelegramId: user_telegram_id
    })

    const response: SubscriptionResponse = {
      success: true,
      message: 'Subscription deleted successfully'
    }

    res.json(response)
  } catch (error) {
    logger.error('[Instagram API] Error deleting competitor subscription', {
      error: error instanceof Error ? error.message : String(error),
      subscriptionId: req.params.id,
      userTelegramId: req.query.user_telegram_id
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error while deleting subscription'
    })
  }
})

// ==========================================
// GET /api/competitor-subscriptions/:id
// Получение отдельной подписки
// ==========================================
router.get('/competitor-subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: user_telegram_id, bot_name'
      })
    }

    logger.info('[Instagram API] Getting competitor subscription by ID', {
      subscriptionId: id,
      userTelegramId: user_telegram_id,
      botName: bot_name
    })

    const subscription = await getSubscriptionById(
      id,
      user_telegram_id as string,
      bot_name as string
    )

    if (!subscription) {
      logger.warn('[Instagram API] Subscription not found', {
        subscriptionId: id,
        userTelegramId: user_telegram_id,
        botName: bot_name
      })

      const response: SubscriptionResponse = {
        success: false,
        error: 'Subscription not found or access denied'
      }

      return res.status(404).json(response)
    }

    logger.info('[Instagram API] Retrieved competitor subscription', {
      subscriptionId: subscription.id,
      userTelegramId: subscription.user_telegram_id,
      competitorUsername: subscription.competitor_username
    })

    const response: SubscriptionResponse = {
      success: true,
      subscription
    }

    res.json(response)
  } catch (error) {
    logger.error('[Instagram API] Error getting competitor subscription by ID', {
      error: error instanceof Error ? error.message : String(error),
      subscriptionId: req.params.id,
      userTelegramId: req.query.user_telegram_id
    })

    res.status(500).json({
      success: false,
      error: 'Internal server error while fetching subscription'
    })
  }
})

export default router