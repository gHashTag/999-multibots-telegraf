import { Request, Response } from 'express'
import * as crypto from 'crypto'
import { GitHubAutoFixerService } from './github-autofixer.service'
import { TelegramNotifierService } from '../services/telegram-notifier.service'

export class GitHubAutoFixerController {
  private readonly autoFixerService: GitHubAutoFixerService
  private readonly telegramNotifier: TelegramNotifierService
  private readonly webhookSecret: string

  constructor() {
    this.autoFixerService = new GitHubAutoFixerService()
    this.telegramNotifier = new TelegramNotifierService()
    this.webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || ''
  }

  async handlePullRequestWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Валидация подписи GitHub webhook
      if (!this.validateWebhookSignature(req)) {
        res.status(401).json({ error: 'Invalid signature' })
        return
      }

      const { action, pull_request, repository } = req.body

      // Обрабатываем только opened/synchronize PR
      if (!['opened', 'synchronize'].includes(action)) {
        res.status(200).json({ message: 'Event ignored' })
        return
      }

      console.log(`🔧 [GitHub AutoFixer] PR #${pull_request.number} - ${action}`)
      
      // Уведомляем в Telegram о начале обработки
      await this.telegramNotifier.notifyAutoFixStart({
        prNumber: pull_request.number,
        title: pull_request.title,
        author: pull_request.user.login,
        repoName: repository.name,
        url: pull_request.html_url
      })

      // Запускаем автофиксер в фоне
      this.processAutoFix({
        prNumber: pull_request.number,
        headBranch: pull_request.head.ref,
        baseBranch: pull_request.base.ref,
        repoOwner: repository.owner.login,
        repoName: repository.name,
        title: pull_request.title,
        url: pull_request.html_url
      }).catch(async (error) => {
        console.error('❌ [GitHub AutoFixer] Error:', error)
        await this.telegramNotifier.notifyAutoFixError({
          prNumber: pull_request.number,
          title: pull_request.title,
          error: error.message,
          url: pull_request.html_url
        })
      })

      res.status(200).json({ message: 'Webhook received' })
    } catch (error) {
      console.error('❌ [GitHub AutoFixer] Webhook error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  private validateWebhookSignature(req: Request): boolean {
    if (!this.webhookSecret) return true // Skip validation in dev

    const signature = req.headers['x-hub-signature-256'] as string
    if (!signature) return false

    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex')

    return `sha256=${expectedSignature}` === signature
  }

  private async processAutoFix(prData: {
    prNumber: number
    headBranch: string
    baseBranch: string
    repoOwner: string
    repoName: string
    title: string
    url: string
  }): Promise<void> {
    const startTime = Date.now()

    try {
      const fixes = await this.autoFixerService.analyzeAndFixPR(prData)
      
      if (fixes.length > 0) {
        const fixTime = ((Date.now() - startTime) / 1000).toFixed(1)
        
        await this.telegramNotifier.notifyAutoFixSuccess({
          prNumber: prData.prNumber,
          title: prData.title,
          fixes: fixes,
          timeSeconds: parseFloat(fixTime),
          url: prData.url
        })
      } else {
        await this.telegramNotifier.notifyNoFixesNeeded({
          prNumber: prData.prNumber,
          title: prData.title,
          url: prData.url
        })
      }
    } catch (error) {
      throw error // Re-throw для обработки в главном catch
    }
  }

  async handleManualFix(req: Request, res: Response): Promise<void> {
    try {
      const { prNumber } = req.params
      const { repoOwner, repoName } = req.body

      if (!prNumber || !repoOwner || !repoName) {
        res.status(400).json({ error: 'Missing required parameters' })
        return
      }

      console.log(`🔧 [Manual Fix] Starting fix for PR #${prNumber}`)

      // Запускаем ручное исправление
      const fixes = await this.autoFixerService.manualFixPR({
        prNumber: parseInt(prNumber),
        repoOwner,
        repoName
      })

      res.status(200).json({ 
        message: 'Manual fix completed',
        fixes: fixes.length,
        details: fixes
      })
    } catch (error) {
      console.error('❌ [Manual Fix] Error:', error)
      res.status(500).json({ error: error.message })
    }
  }
}