import { Router } from 'express'
import { CompetitorMonitoringApiService } from '@/services/competitorMonitoringApiService'

const router = Router()
const competitorService = new CompetitorMonitoringApiService()

router.get('/api/competitor-subscriptions', async (req, res) => {
  try {
    const { user_telegram_id, bot_name } = req.query

    if (!user_telegram_id || !bot_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      })
    }

    // Мок ответ для демо
    const subscriptions = []

    res.json({
      success: true,
      data: subscriptions
    })
  } catch (error) {
    console.error('Competitor monitoring error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

router.post('/api/competitor-subscriptions', async (req, res) => {
  try {
    // Создать подписку
    res.json({
      success: true,
      message: 'Subscription created'
    })
  } catch (error) {
    console.error('Create subscription error:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

export default router
