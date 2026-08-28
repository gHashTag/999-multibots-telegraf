import express, { Router } from 'express'
import { GitHubAutoFixerController } from '../../webhooks/github-autofixer.controller'
import {
  githubWebhookRateLimit,
  validateGitHubHeaders,
  validatePullRequestEvent,
  logWebhookRequest,
  enableRawBody,
} from '../../webhooks/github-autofixer.middleware'

const router: Router = express.Router()
const controller = new GitHubAutoFixerController()

// Middleware для всех GitHub webhook endpoints
router.use(githubWebhookRateLimit as any)
router.use(logWebhookRequest)

// Основной endpoint для GitHub PR webhooks
router.post(
  '/webhooks/github/pr-issues',
  [enableRawBody, validateGitHubHeaders, validatePullRequestEvent],
  async (req: any, res: any) => {
    await controller.handlePullRequestWebhook(req, res)
  }
)

// Endpoint для ручного исправления PR
router.post(
  '/webhooks/github/manual-fix/:prNumber',
  async (req: any, res: any) => {
    await controller.handleManualFix(req, res)
  }
)

// Endpoint для проверки статуса автофиксера
router.get('/autofixer/status', (req: any, res: any) => {
  res.json({
    status: 'active',
    version: '1.0.0',
    features: {
      githubWebhooks: true,
      claudeIntegration: !!process.env.CLAUDE_API_KEY,
      telegramNotifications: !!process.env.BOT_TOKEN_1,
      botSpecificFixes: true,
    },
    supportedEvents: ['pull_request.opened', 'pull_request.synchronize'],
    botFixTypes: ['async/await', 'telegraf', 'scenes', 'typescript', 'eslint'],
  })
})

// Endpoint для статистики автофиксера
router.get('/autofixer/stats', (req: any, res: any) => {
  // TODO: Реализовать сбор статистики из базы данных
  res.json({
    totalPRsProcessed: 0,
    totalFixesApplied: 0,
    averageProcessingTime: 0,
    fixTypeDistribution: {
      async: 0,
      telegraf: 0,
      scene: 0,
      typescript: 0,
      eslint: 0,
    },
    successRate: 0,
  })
})

// Health check для автофиксера
router.get('/autofixer/health', (req: any, res: any) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      github: !!process.env.GITHUB_TOKEN,
      claude: !!process.env.CLAUDE_API_KEY,
      telegram: !!process.env.BOT_TOKEN_1,
      webhook_secret: !!process.env.GITHUB_WEBHOOK_SECRET,
    },
  }

  const allHealthy = Object.values(health.checks).every(Boolean)
  if (!allHealthy) {
    health.status = 'degraded'
    res.status(503)
  }

  res.json(health)
})

export default router
