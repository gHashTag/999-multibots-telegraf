import { GitHubAutoFixerController } from '../../src/webhooks/github-autofixer.controller'
import { GitHubAutoFixerService } from '../../src/webhooks/github-autofixer.service'
import { TelegramNotifierService } from '../../src/services/telegram-notifier.service'

// Мокаем внешние зависимости
jest.mock('../../src/webhooks/github-autofixer.service')
jest.mock('../../src/services/telegram-notifier.service')

describe('GitHubAutoFixerController', () => {
  let controller: GitHubAutoFixerController
  let mockService: jest.Mocked<GitHubAutoFixerService>
  let mockNotifier: jest.Mocked<TelegramNotifierService>
  let mockReq: any
  let mockRes: any

  beforeEach(() => {
    mockService = new GitHubAutoFixerService() as jest.Mocked<GitHubAutoFixerService>
    mockNotifier = new TelegramNotifierService() as jest.Mocked<TelegramNotifierService>
    
    controller = new GitHubAutoFixerController()
    
    mockReq = {
      body: {},
      headers: {},
      get: jest.fn()
    }
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }

    process.env.GITHUB_WEBHOOK_SECRET = 'test-secret'
  })

  afterEach(() => {
    jest.clearAllMocks()
    delete process.env.GITHUB_WEBHOOK_SECRET
  })

  describe('handlePullRequestWebhook', () => {
    it('should process opened PR webhook', async () => {
      mockReq.body = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          user: { login: 'testuser' },
          html_url: 'https://github.com/test/repo/pull/123',
          head: { ref: 'feature-branch' },
          base: { ref: 'main' }
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'testowner' }
        }
      }

      mockReq.headers['x-hub-signature-256'] = 'sha256=test-signature'
      mockService.analyzeAndFixPR = jest.fn().mockResolvedValue([
        { type: 'async', description: 'Added async to handler', filePath: 'test.ts' }
      ])

      await controller.handlePullRequestWebhook(mockReq, mockRes)

      expect(mockNotifier.notifyAutoFixStart).toHaveBeenCalledWith({
        prNumber: 123,
        title: 'Test PR',
        author: 'testuser',
        repoName: 'test-repo',
        url: 'https://github.com/test/repo/pull/123'
      })

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Webhook received' })
    })

    it('should ignore unsupported actions', async () => {
      mockReq.body = {
        action: 'closed',
        pull_request: { number: 123 }
      }

      await controller.handlePullRequestWebhook(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Event ignored' })
      expect(mockNotifier.notifyAutoFixStart).not.toHaveBeenCalled()
    })

    it('should handle webhook validation failure', async () => {
      mockReq.body = { action: 'opened', pull_request: {} }
      mockReq.headers = {} // No signature

      await controller.handlePullRequestWebhook(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid signature' })
    })

    it('should handle processing errors', async () => {
      mockReq.body = {
        action: 'opened',
        pull_request: {
          number: 123,
          title: 'Test PR',
          user: { login: 'testuser' },
          html_url: 'https://github.com/test/repo/pull/123',
          head: { ref: 'feature-branch' },
          base: { ref: 'main' }
        },
        repository: {
          name: 'test-repo',
          owner: { login: 'testowner' }
        }
      }

      delete process.env.GITHUB_WEBHOOK_SECRET // Skip signature validation
      mockService.analyzeAndFixPR = jest.fn().mockRejectedValue(new Error('Processing failed'))

      await controller.handlePullRequestWebhook(mockReq, mockRes)

      // Процесс должен завершиться успешно, ошибки обрабатываются в фоне
      expect(mockRes.status).toHaveBeenCalledWith(200)

      // Ждем обработку фоновой задачи
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockNotifier.notifyAutoFixError).toHaveBeenCalledWith({
        prNumber: 123,
        title: 'Test PR',
        error: 'Processing failed',
        url: 'https://github.com/test/repo/pull/123'
      })
    })
  })

  describe('handleManualFix', () => {
    it('should process manual fix request', async () => {
      mockReq.params = { prNumber: '123' }
      mockReq.body = { repoOwner: 'testowner', repoName: 'test-repo' }

      const mockFixes = [
        { type: 'async', description: 'Fixed async issue', filePath: 'test.ts' }
      ]

      mockService.manualFixPR = jest.fn().mockResolvedValue(mockFixes)

      await controller.handleManualFix(mockReq, mockRes)

      expect(mockService.manualFixPR).toHaveBeenCalledWith({
        prNumber: 123,
        repoOwner: 'testowner',
        repoName: 'test-repo'
      })

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Manual fix completed',
        fixes: 1,
        details: mockFixes
      })
    })

    it('should validate required parameters', async () => {
      mockReq.params = {}
      mockReq.body = {}

      await controller.handleManualFix(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Missing required parameters' })
    })

    it('should handle manual fix errors', async () => {
      mockReq.params = { prNumber: '123' }
      mockReq.body = { repoOwner: 'testowner', repoName: 'test-repo' }

      mockService.manualFixPR = jest.fn().mockRejectedValue(new Error('Fix failed'))

      await controller.handleManualFix(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Fix failed' })
    })
  })
})

describe('GitHubAutoFixerService', () => {
  let service: GitHubAutoFixerService
  
  beforeEach(() => {
    service = new GitHubAutoFixerService()
    
    // GitHub API уже замокан в service файле
    // TODO: Добавить реальные моки после установки @octokit/rest
  })

  it('should be instantiable', () => {
    expect(service).toBeInstanceOf(GitHubAutoFixerService)
  })

  // Дополнительные тесты для сервиса можно добавить по мере необходимости
})