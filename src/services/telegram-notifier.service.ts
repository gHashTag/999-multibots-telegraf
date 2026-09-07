import { Telegraf } from 'telegraf'
import { MyContext } from '../interfaces'
import { FixResult } from '../webhooks/github-autofixer.service'
import { telegramClientOptions } from '@/services/telegramApi'

export interface AutoFixStartNotification {
  prNumber: number
  title: string
  author: string
  repoName: string
  url: string
}

export interface AutoFixSuccessNotification {
  prNumber: number
  title: string
  fixes: FixResult[]
  timeSeconds: number
  url: string
}

export interface AutoFixErrorNotification {
  prNumber: number
  title: string
  error: string
  url: string
}

export interface NoFixesNeededNotification {
  prNumber: number
  title: string
  url: string
}

export class TelegramNotifierService {
  private readonly bot: Telegraf<MyContext> | null
  private readonly adminChatId: string
  private readonly devChannelId: string

  constructor() {
    const botToken = process.env.BOT_TOKEN_1
    this.adminChatId = process.env.ADMIN_CHAT_ID || ''
    this.devChannelId = process.env.DEV_CHANNEL_ID || ''

    if (botToken) {
      this.bot = new Telegraf<MyContext>(botToken, {
        telegram: telegramClientOptions(),
      })
    } else {
      this.bot = null
      // TelegramNotifier не используется - уведомления через Typefully
    }
  }

  async notifyAutoFixStart(data: AutoFixStartNotification): Promise<void> {
    const message = this.formatAutoFixStartMessage(data)

    await this.sendToAdmin(message)
    await this.sendToDevChannel(message)
  }

  async notifyAutoFixSuccess(data: AutoFixSuccessNotification): Promise<void> {
    const message = this.formatAutoFixSuccessMessage(data)

    await this.sendToAdmin(message)
    await this.sendToDevChannel(message)
  }

  async notifyAutoFixError(data: AutoFixErrorNotification): Promise<void> {
    const message = this.formatAutoFixErrorMessage(data)

    await this.sendToAdmin(message)
    await this.sendToDevChannel(message)
  }

  async notifyNoFixesNeeded(data: NoFixesNeededNotification): Promise<void> {
    const message = this.formatNoFixesNeededMessage(data)

    await this.sendToDevChannel(message)
  }

  private formatAutoFixStartMessage(data: AutoFixStartNotification): string {
    return `🔧 <b>AutoFixer Started</b>

<b>PR #${data.prNumber}:</b> "${data.title}"
<b>Author:</b> @${data.author}
<b>Repo:</b> ${data.repoName}
<b>Status:</b> 🔍 Analyzing code...

<a href="${data.url}">View PR on GitHub</a>`
  }

  private formatAutoFixSuccessMessage(
    data: AutoFixSuccessNotification
  ): string {
    const fixesByType = this.groupFixesByType(data.fixes)
    const fixesText = Object.entries(fixesByType)
      .map(
        ([type, count]) =>
          `${this.getFixTypeIcon(type)} ${this.getFixTypeName(type)}: ${count}`
      )
      .join('\\n')

    return `✅ <b>AutoFixer Success</b>

<b>PR #${data.prNumber}:</b> "${data.title}"
<b>Time:</b> ${data.timeSeconds}s
<b>Fixes Applied:</b> ${data.fixes.length}

<b>Fix Details:</b>
${fixesText}

<a href="${data.url}">View PR on GitHub</a>

━━━━━━━━━━━━━━━━━━━━━`
  }

  private formatAutoFixErrorMessage(data: AutoFixErrorNotification): string {
    return `🚨 <b>AutoFixer Failed</b>

<b>PR #${data.prNumber}:</b> "${data.title}"
<b>Error:</b> ${data.error}
<b>Status:</b> ❌ Manual review required

<a href="${data.url}">View PR on GitHub</a>

<i>Use /fix_pr ${data.prNumber} to retry manually</i>`
  }

  private formatNoFixesNeededMessage(data: NoFixesNeededNotification): string {
    return `✨ <b>No Fixes Needed</b>

<b>PR #${data.prNumber}:</b> "${data.title}"
<b>Status:</b> 🎯 Code looks good!

<a href="${data.url}">View PR on GitHub</a>`
  }

  private groupFixesByType(fixes: FixResult[]): Record<string, number> {
    return fixes.reduce(
      (acc, fix) => {
        acc[fix.type] = (acc[fix.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )
  }

  private getFixTypeIcon(type: string): string {
    const icons = {
      typescript: '🔷',
      eslint: '📏',
      telegraf: '🤖',
      scene: '🎭',
      async: '⚡',
    }
    return icons[type] || '🔧'
  }

  private getFixTypeName(type: string): string {
    const names = {
      typescript: 'TypeScript',
      eslint: 'ESLint',
      telegraf: 'Telegraf',
      scene: 'Scene Issues',
      async: 'Async/Await',
    }
    return names[type] || type
  }

  private async sendToAdmin(message: string): Promise<void> {
    if (!this.bot || !this.adminChatId) return

    try {
      await this.bot.telegram.sendMessage(this.adminChatId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      })
    } catch (error) {
      console.error(
        '❌ [TelegramNotifier] Failed to send admin message:',
        error
      )
    }
  }

  private async sendToDevChannel(message: string): Promise<void> {
    if (!this.bot || !this.devChannelId) return

    try {
      await this.bot.telegram.sendMessage(this.devChannelId, message, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      })
    } catch (error) {
      console.error(
        '❌ [TelegramNotifier] Failed to send channel message:',
        error
      )
    }
  }

  // Метод для тестирования уведомлений
  async sendTestNotification(): Promise<void> {
    const testMessage = `🧪 <b>AutoFixer Test</b>

System is working correctly!
Time: ${new Date().toISOString()}`

    await this.sendToAdmin(testMessage)
    await this.sendToDevChannel(testMessage)
  }
}
