import express, { Router } from 'express'
import { logger } from '@/utils/logger'
import {
  calculateOwnerDebt,
  generateDebtReport,
} from '@/services/bot-owner-billing'
import { supabaseAdmin } from '@/core/supabase'

const router: Router = express.Router()

/**
 * GET /api/billing — summary of all bots' debt
 */
router.get('/billing', async (_req: any, res: any) => {
  try {
    const { data: bots, error } = await supabaseAdmin
      .from('avatars')
      .select('bot_name')

    if (error || !bots) {
      return res.status(500).json({ error: 'Failed to fetch bots' })
    }

    const botNames = [
      ...new Set(
        bots.map((b: { bot_name: string }) => b.bot_name).filter(Boolean)
      ),
    ]

    const summaries = await Promise.all(
      botNames.map((name) => calculateOwnerDebt(name as string))
    )

    return res.json({
      timestamp: new Date().toISOString(),
      bots: summaries,
      total_platform_debt: summaries.reduce((s, b) => s + Math.max(b.debt, 0), 0),
    })
  } catch (err) {
    logger.error('[Billing API] GET /billing failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/billing/:botName — detailed report for one bot
 */
router.get('/billing/:botName', async (req: any, res: any) => {
  try {
    const { botName } = req.params
    const summary = await calculateOwnerDebt(botName)
    const report = await generateDebtReport(botName)

    return res.json({
      timestamp: new Date().toISOString(),
      summary,
      report_html: report,
    })
  } catch (err) {
    logger.error('[Billing API] GET /billing/:botName failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/billing/:botName/pay — record a manual payment from the bot owner
 * Body: { amount_stars: number, admin_key: string }
 */
router.post('/billing/:botName/pay', async (req: any, res: any) => {
  try {
    const { botName } = req.params
    const { amount_stars, admin_key } = req.body || {}

    // Simple admin key check (use ADMIN_API_KEY from env)
    const expectedKey = process.env.ADMIN_API_KEY
    if (!expectedKey || admin_key !== expectedKey) {
      return res.status(403).json({ error: 'Forbidden: invalid admin_key' })
    }

    if (!amount_stars || typeof amount_stars !== 'number' || amount_stars <= 0) {
      return res
        .status(400)
        .json({ error: 'amount_stars must be a positive number' })
    }

    // Insert into owner_payments (create table gracefully if needed)
    const { error: insertErr } = await supabaseAdmin
      .from('owner_payments')
      .insert({
        bot_name: botName,
        amount_stars,
        paid_at: new Date().toISOString(),
      })

    if (insertErr) {
      logger.error('[Billing API] Failed to record payment', {
        botName,
        error: insertErr.message,
      })
      return res
        .status(500)
        .json({ error: 'Failed to record payment', detail: insertErr.message })
    }

    // Recalculate debt after payment
    const updated = await calculateOwnerDebt(botName)

    logger.info('[Billing API] Owner payment recorded', {
      botName,
      amount_stars,
      new_debt: updated.debt,
    })

    return res.json({
      success: true,
      botName,
      amount_stars,
      new_debt: updated.debt,
    })
  } catch (err) {
    logger.error('[Billing API] POST /billing/:botName/pay failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
