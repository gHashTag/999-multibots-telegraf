import { ClaudeIntegrationService } from '../services/claude-integration.service'
import { logger } from '@/utils/enhancedLogger'
import { BotCodeAnalyzer } from '../utils/bot-code-analyzer'

import { Octokit } from '@octokit/rest'

export interface FixResult {
  type: 'typescript' | 'eslint' | 'telegraf' | 'scene' | 'async'
  description: string
  filePath: string
  lineNumber?: number
}

export class GitHubAutoFixerService {
  private readonly octokit: Octokit
  private readonly claudeService: ClaudeIntegrationService
  private readonly codeAnalyzer: BotCodeAnalyzer

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    })
    this.claudeService = new ClaudeIntegrationService()
    this.codeAnalyzer = new BotCodeAnalyzer()
  }

  async analyzeAndFixPR(prData: {
    prNumber: number
    headBranch: string
    baseBranch: string
    repoOwner: string
    repoName: string
  }): Promise<FixResult[]> {
    logger.debug(`🔍 [AutoFixer] Analyzing PR #${prData.prNumber}`)

    const fixes: FixResult[] = []

    try {
      // 1. Получаем изменения в PR
      const { data: prFiles } = await this.octokit.pulls.listFiles({
        owner: prData.repoOwner,
        repo: prData.repoName,
        pull_number: prData.prNumber,
      })

      // 2. Фильтруем только TypeScript/JavaScript файлы
      const codeFiles = prFiles.filter(file => 
        /\.(ts|js|tsx|jsx)$/.test(file.filename) && 
        file.status !== 'removed'
      )

      if (codeFiles.length === 0) {
        logger.debug('📝 [AutoFixer] No code files to analyze')
        return fixes
      }

      // 3. Анализируем каждый файл
      for (const file of codeFiles) {
        const fileContent = await this.getFileContent(
          prData.repoOwner,
          prData.repoName,
          file.filename,
          prData.headBranch
        )

        if (!fileContent) continue

        // 4. Специальный анализ для Bot-кода
        const botIssues = this.codeAnalyzer.analyzeFile(file.filename, fileContent)
        
        // 5. Claude анализ с Bot-специфичными промптами
        const claudeFixes = await this.claudeService.analyzeBotCode({
          filePath: file.filename,
          content: fileContent,
          patch: file.patch || '',
          knownIssues: botIssues
        })

        if (claudeFixes.length > 0) {
          // 6. Применяем исправления
          const fixedContent = await this.claudeService.applyFixes(
            fileContent,
            claudeFixes
          )

          // 7. Коммитим исправления
          await this.commitFixes(
            prData.repoOwner,
            prData.repoName,
            prData.headBranch,
            file.filename,
            fixedContent,
            claudeFixes
          )

          fixes.push(...claudeFixes)
        }
      }

      logger.debug(`✅ [AutoFixer] Applied ${fixes.length} fixes to PR #${prData.prNumber}`)
      return fixes

    } catch (error) {
      logger.error('❌ [AutoFixer] Error analyzing PR:', error)
      throw new Error(`Failed to analyze PR: ${error.message}`)
    }
  }

  async manualFixPR(data: {
    prNumber: number
    repoOwner: string
    repoName: string
  }): Promise<FixResult[]> {
    // Получаем данные PR
    const { data: pr } = await this.octokit.pulls.get({
      owner: data.repoOwner,
      repo: data.repoName,
      pull_number: data.prNumber,
    })

    return this.analyzeAndFixPR({
      prNumber: data.prNumber,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      repoOwner: data.repoOwner,
      repoName: data.repoName,
    })
  }

  private async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      })

      if ('content' in data) {
        return Buffer.from(data.content, 'base64').toString('utf8')
      }
      return null
    } catch (error) {
      logger.warn(`⚠️ [AutoFixer] Could not get content for ${path}:`, error.message)
      return null
    }
  }

  private async commitFixes(
    owner: string,
    repo: string,
    branch: string,
    filePath: string,
    content: string,
    fixes: FixResult[]
  ): Promise<void> {
    try {
      // Получаем текущий SHA файла
      const { data: fileData } = await this.octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      })

      const sha = 'sha' in fileData ? fileData.sha : ''

      // Создаем commit message
      const fixDescriptions = fixes.map(f => `- ${f.description}`).join('\\n')
      const commitMessage = `🤖 Auto-fix: ${filePath}

${fixDescriptions}

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>`

      // Коммитим изменения
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
      })

      logger.debug(`📝 [AutoFixer] Committed fixes to ${filePath}`)
    } catch (error) {
      logger.error(`❌ [AutoFixer] Failed to commit ${filePath}:`, error)
      throw error
    }
  }
}