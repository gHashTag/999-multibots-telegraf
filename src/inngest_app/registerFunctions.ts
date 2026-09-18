/**
 * Register All Inngest Functions
 * Centralized registration for all migrated functions from ai-server
 */

import { serve } from 'inngest/express'
import { inngest } from './inngestClient'
// Тот же клиент (id 'telegram-bot-client'), которым создаются ВСЕ остальные
// функции. serve() ниже использует inngest из './inngestClient' (id 'vibee') —
// пара «функции на одном клиенте, serve на другом» — рабочий прод-паттерн.
import { inngest as inngestFnClient } from './client'
import { logger } from '@/utils/logger'

// Content Functions
import { analyzeCompetitorReels } from './functions/content/analyzeCompetitorReels'
import { extractTopContent } from './functions/content/extractTopContent'
import { findCompetitors } from './functions/content/findCompetitors'
import { generateContentScripts } from './functions/content/generateContentScripts'
import { generateDetailedScript } from './functions/content/generateDetailedScript'
import { generateScenarioClips } from './functions/content/generateScenarioClips'

// Instagram Functions - disabled: missing schema exports in @/core/instagram/schemas
// import { instagramScraperV2 } from './functions/instagram/instagramScraper-v2'
// import { instagramReelsTest } from './functions/instagram/instagramScraper-v2-simple'

// Monitoring Functions
import {
  criticalErrorMonitor,
  healthCheck,
} from './functions/monitoring/criticalErrorMonitor'
import {
  logMonitor,
  triggerLogMonitor,
} from './functions/monitoring/logMonitor'

// Training Functions
import { modelTrainingV2 } from './functions/training/modelTrainingV2'
import { morphImages } from './functions/training/morphImages'
import { checkStuckTrainings } from './functions/training/checkStuckTrainings'
import { welcomeAvatarGeneration } from './functions/welcomeAvatarGeneration'
// Обработчик завершения обучения. Живой путь v1 (generateModelTrainingFunction)
// регистрирует webhook Replicate, тот шлёт model/training.completed — но
// подписчика не было, и обещанное «получите уведомление когда завершится»
// не приходило. Импорт фабрики напрямую из existing/ — чтобы registration.test
// увидел регистрацию именно файла-определения, а не обёртки.
import { createHandleModelTrainingCompletedFunction } from './functions/existing/handleModelTrainingCompleted'
// Webhook guard for video generation. video/generation-validate-webhook is sent
// live from KieAiProvider.generateVideo, but its subscriber was never
// registered, so the event was dropped. Register ONLY
// validateWebhookBeforeGeneration -- NOT the file's hourly cron
// (periodicWebhookHealthCheck) or admin-alarm paths, which the owner left off.
// Monitoring only: KieAiProvider fire-and-forgets the send, so this surfaces
// webhook health in logs/Inngest but does not block generation (full gating
// would need a KieAiProvider change).
import { validateWebhookBeforeGeneration } from './functions/webhookHealthGuard'

// Generation Functions
import { neuroImageGeneration } from './functions/generation/neuroImageGeneration'

// Payment Functions
import { processPayment } from './functions/payments/paymentProcessing'

// Broadcast Functions
import { broadcastMessage } from './functions/broadcast/broadcastMessage'

// Callback Functions
import { aiReelsCallbackFunction } from './functions/ai-reels-callback'

// Render Functions
import { renderFunction } from './functions/render/render'
import { renderAvatarVideoFunction } from './functions/render/renderAvatarVideo'
import { renderRiddleFunction } from './functions/render/renderRiddle'

// CRM Functions
import { crmProactiveSweep } from './functions/crm/crmProactiveSweep'
import { tonPendingWatch } from './functions/money/tonPendingWatch'
import { robokassaUnclaimedWatch } from './functions/money/robokassaUnclaimedWatch'

// Analytics Functions
import { dailySalesAdvisor } from './functions/analytics/dailySalesAdvisor'
import { skillDetector } from './functions/analytics/skillDetector'

// Existing Functions
import { generateAIReelsFunction } from './functions/existing/generateAIReelsFunction'
import { generateAdvancedLoopingVideoFunction } from './functions/existing/generateAdvancedLoopingVideoFunction'
import { generateModelTrainingFunction } from './functions/existing/generateModelTrainingFunction'

// Создаётся тем же клиентом './client', что и modelTrainingV2 и остальные —
// проверенная в проде связка (см. импорт inngestFnClient выше).
const handleModelTrainingCompleted =
  createHandleModelTrainingCompletedFunction(inngestFnClient)

const allFunctionsRaw = [
  // Content (6)
  analyzeCompetitorReels,
  extractTopContent,
  findCompetitors,
  generateContentScripts,
  generateDetailedScript,
  generateScenarioClips,

  // Instagram (2) - disabled: missing schema exports
  // instagramScraperV2,
  // instagramReelsTest,

  // Monitoring (4)
  criticalErrorMonitor,
  healthCheck,
  logMonitor,
  triggerLogMonitor,

  // Training (4)
  modelTrainingV2,
  morphImages,
  handleModelTrainingCompleted,
  // Stuck-training watchdog: a 30-min cron that re-fires the lost
  // model/training.completed for trainings Replicate finished but whose webhook
  // was dropped. handleModelTrainingCompleted above flips the DB status to a
  // terminal value, so the next run no longer selects the row — the cron is
  // self-terminating and there is no refund path, so it cannot loop or
  // double-pay. See docs/audit/feature-inventory.md.
  checkStuckTrainings,

  // Webhook guard (1)
  validateWebhookBeforeGeneration,

  // Generation (1)
  neuroImageGeneration,

  // Welcome lead-magnet (1): a free SeeDream-4.5 hero portrait from the new
  // user's Telegram photo. Fires once per new user with a detectable face
  // (createUserScene), skips the user's balance (is_welcome_gift), and degrades
  // to a friendly fallback message if the provider call fails.
  welcomeAvatarGeneration,

  // Payment (1)
  processPayment,

  // Broadcast (1)
  broadcastMessage,

  // Callback (1)
  aiReelsCallbackFunction,

  // Render (3)
  renderFunction,
  renderAvatarVideoFunction,
  renderRiddleFunction,

  // Analytics (2)
  dailySalesAdvisor,
  skillDetector,

  // CRM (1): the seller's 30-min tick, moved from setInterval to a cron run
  // so every sweep has a trace (CRM_SWEEP_DRIVER=timer restores the interval).
  crmProactiveSweep,
  // Hourly: coins on the chain that nothing ever credited. Reads only; the
  // TON channel completes on the payer's press, so without this nobody looks.
  tonPendingWatch,
  // Daily: roubles the provider says were paid while our row still says
  // PENDING. Reads only; the same five-people loss, asked on a schedule.
  robokassaUnclaimedWatch,

  // Existing (3)
  generateAIReelsFunction,
  generateAdvancedLoopingVideoFunction,
  generateModelTrainingFunction,
]

export const allInngestFunctions = allFunctionsRaw.filter((f, index) => {
  if (!f) {
    logger.warn(
      `⚠️ [INNGEST] Function at index ${index} is undefined - skipping`
    )
    return false
  }
  return true
})

logger.info('🚀 [INNGEST] Registering functions', {
  count: allInngestFunctions.length,
  functions: allInngestFunctions.map(f => f.name || 'unnamed'),
})

export const inngestHandler = serve({
  client: inngest,
  functions: allInngestFunctions,
})

export function getFunctionStatus() {
  return {
    total: allInngestFunctions.length,
    names: allInngestFunctions.map(f => f.name || 'unnamed'),
  }
}

export { allInngestFunctions as functions }
