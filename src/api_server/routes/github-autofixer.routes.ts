import express, { Router } from 'express'
import { GitHubAutoFixerController } from '../../webhooks/github-autofixer.controller'
import {
  githubWebhookRateLimit,
  validateGitHubHeaders,
  validatePullRequestEvent,
  logWebhookRequest,
  enableRawBody,
} from '../../webhooks/github-autofixer.middleware'
import { requireInternalKey } from '../middleware/requireInternalKey'

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
// Unlike the pr-issues webhook (verified by GitHub signature), this is a manual
// admin trigger with no signature to check — and it performs privileged GitHub
// writes and paid Claude calls from client-supplied repoOwner/repoName. Gate it
// with the internal key (fail-closed), the same guard the other privileged
// routers use. The router stays mounted open so the signed webhook still works.
router.post(
  '/webhooks/github/manual-fix/:prNumber',
  requireInternalKey,
  async (req: any, res: any) => {
    await controller.handleManualFix(req, res)
  }
)

// Endpoint для проверки статуса автофиксера
//
// This router is mounted WITHOUT requireInternalKey, so everything below is
// world-readable. The per-secret booleans that used to live here told an
// anonymous caller which credentials the deployment holds. diagnostic.routes
// reports the same thing and is mounted behind the internal key; this router
// was the one place the same disclosure was public.
//
// The endpoints stay open and keep their shape, because an external uptime
// monitor may poll them and nothing in the repo does, so no consumer can be
// checked. Only the configuration detail is gone.
router.get('/autofixer/status', (req: any, res: any) => {
  res.json({
    status: 'active',
    version: '1.0.0',
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
  // A conjunction, not a map. The verdict is what a monitor needs; WHICH
  // secret is missing is the part that helps an attacker choose an attack --
  // webhook_secret being false says the signed webhook cannot verify.
  //
  // Deliberately not `const checks = { … }`: an object of per-secret booleans
  // is one keystroke from being serialised into the response, and that is the
  // exact shape this router used to send. A plain boolean cannot leak a name.
  const allHealthy =
    !!process.env.GITHUB_TOKEN &&
    !!process.env.CLAUDE_API_KEY &&
    !!process.env.BOT_TOKEN_1 &&
    !!process.env.GITHUB_WEBHOOK_SECRET

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
  }
  if (!allHealthy) {
    health.status = 'degraded'
    res.status(503)
  }

  res.json(health)
})

export default router
