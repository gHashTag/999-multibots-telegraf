#!/usr/bin/env bun

/**
 * Production Monitoring System for Bot Infrastructure
 * Prevents the nginx port mismatch and bot responsiveness issues from recurring
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { telegramApiFor } from '../services/telegramApi'

const execAsync = promisify(exec)

interface HealthCheck {
  name: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  timestamp: Date
  critical: boolean
}

interface MonitoringConfig {
  checkInterval: number
  alertThresholds: {
    consecutiveFailures: number
    responseTimeMs: number
  }
  notifications: {
    telegramBotToken?: string
    alertChatId?: string
    emailAlerts?: boolean
  }
  autoFix: {
    enabled: boolean
    nginxConfig: boolean
    containerRestart: boolean
  }
}

export class ProductionMonitor {
  private config: MonitoringConfig
  private healthHistory: HealthCheck[] = []
  private alertsSent: Set<string> = new Set()
  private monitoringInterval?: NodeJS.Timeout

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      checkInterval: 300000, // 5 minutes
      alertThresholds: {
        consecutiveFailures: 3,
        responseTimeMs: 5000,
      },
      notifications: {
        telegramBotToken: process.env.MONITORING_BOT_TOKEN,
        alertChatId: process.env.ALERT_CHAT_ID,
        emailAlerts: false,
      },
      autoFix: {
        enabled: process.env.AUTO_FIX_ENABLED === 'true',
        nginxConfig: true,
        containerRestart: false,
      },
      ...config,
    }
  }

  /**
   * Start continuous monitoring
   */
  async startMonitoring(): Promise<void> {
    console.log('🔍 Starting production monitoring system...')
    console.log(`Check interval: ${this.config.checkInterval / 1000}s`)
    console.log(`Auto-fix enabled: ${this.config.autoFix.enabled}`)

    // Run initial check
    await this.runHealthChecks()

    // Start periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.runHealthChecks()
      } catch (error) {
        console.error('❌ Monitoring cycle failed:', error)
      }
    }, this.config.checkInterval)

    console.log('✅ Production monitoring started')
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
      console.log('🛑 Production monitoring stopped')
    }
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<HealthCheck[]> {
    const timestamp = new Date()
    console.log(`\n🔍 Running health checks at ${timestamp.toISOString()}`)

    const checks: HealthCheck[] = await Promise.all([
      this.checkContainerStatus(),
      this.checkNginxConfiguration(),
      this.checkApiServerAccessibility(),
      this.checkBotPorts(),
      this.checkDomainAccessibility(),
      this.checkWebhookConfiguration(),
      this.checkWebhookServerConfig(),
      this.checkSystemResources(),
    ])

    // Add to history
    this.healthHistory.push(...checks)

    // Keep only last 100 checks per type
    const checksByType = new Map<string, HealthCheck[]>()
    for (const check of this.healthHistory) {
      if (!checksByType.has(check.name)) {
        checksByType.set(check.name, [])
      }
      checksByType.get(check.name)!.push(check)
    }

    // Trim history
    this.healthHistory = []
    for (const [, typeChecks] of checksByType) {
      this.healthHistory.push(...typeChecks.slice(-100))
    }

    // Analyze results and send alerts
    await this.analyzeAndAlert(checks)

    // Display summary
    this.displayHealthSummary(checks)

    return checks
  }

  /**
   * Check container status
   */
  private async checkContainerStatus(): Promise<HealthCheck> {
    try {
      const { stdout } = await execAsync(
        'ssh -i ~/.ssh/selectel root@185.161.67.53 \'docker ps --filter name=999-multibots --format "{{.Status}}"\''
      )
      const status = stdout.trim()

      if (!status) {
        return {
          name: 'container_status',
          status: 'fail',
          message: 'Container 999-multibots is not running',
          timestamp: new Date(),
          critical: true,
        }
      } else if (status.includes('Up')) {
        return {
          name: 'container_status',
          status: 'pass',
          message: `Container running: ${status}`,
          timestamp: new Date(),
          critical: false,
        }
      } else {
        return {
          name: 'container_status',
          status: 'warn',
          message: `Container status unclear: ${status}`,
          timestamp: new Date(),
          critical: false,
        }
      }
    } catch (error) {
      return {
        name: 'container_status',
        status: 'fail',
        message: `Failed to check container: ${error}`,
        timestamp: new Date(),
        critical: true,
      }
    }
  }

  /**
   * Check nginx configuration for correct port
   */
  private async checkNginxConfiguration(): Promise<HealthCheck> {
    try {
      const { stdout } = await execAsync(
        'ssh -i ~/.ssh/selectel root@185.161.67.53 \'docker exec bot-proxy grep "proxy_pass.*localhost:" /etc/nginx/conf.d/default.conf | head -1\''
      )
      const config = stdout.trim()

      if (config.includes('localhost:3000')) {
        return {
          name: 'nginx_config',
          status: 'pass',
          message: 'nginx correctly configured for port 3000',
          timestamp: new Date(),
          critical: false,
        }
      } else if (config.includes('localhost:1980')) {
        // Auto-fix if enabled
        if (this.config.autoFix.enabled && this.config.autoFix.nginxConfig) {
          try {
            await execAsync(`ssh -i ~/.ssh/selectel root@185.161.67.53 '
              docker exec bot-proxy sed -i "s|proxy_pass http://localhost:1980|proxy_pass http://localhost:3000|g" /etc/nginx/conf.d/default.conf
              docker exec bot-proxy nginx -s reload
            '`)

            return {
              name: 'nginx_config',
              status: 'pass',
              message: 'nginx configuration auto-fixed from 1980 to 3000',
              timestamp: new Date(),
              critical: false,
            }
          } catch (fixError) {
            return {
              name: 'nginx_config',
              status: 'fail',
              message: `nginx MISCONFIGURED (port 1980) and auto-fix failed: ${fixError}`,
              timestamp: new Date(),
              critical: true,
            }
          }
        } else {
          return {
            name: 'nginx_config',
            status: 'fail',
            message:
              'nginx MISCONFIGURED: pointing to port 1980 instead of 3000',
            timestamp: new Date(),
            critical: true,
          }
        }
      } else {
        return {
          name: 'nginx_config',
          status: 'warn',
          message: `nginx configuration unclear: ${config}`,
          timestamp: new Date(),
          critical: false,
        }
      }
    } catch (error) {
      return {
        name: 'nginx_config',
        status: 'fail',
        message: `Failed to check nginx config: ${error}`,
        timestamp: new Date(),
        critical: true,
      }
    }
  }

  /**
   * Check API server accessibility
   */
  private async checkApiServerAccessibility(): Promise<HealthCheck> {
    try {
      const { stdout } = await execAsync(
        'ssh -i ~/.ssh/selectel root@185.161.67.53 \'netstat -tulpn | grep ":3000.*LISTEN"\''
      )

      if (stdout.trim()) {
        return {
          name: 'api_server',
          status: 'pass',
          message: 'API server listening on port 3000',
          timestamp: new Date(),
          critical: false,
        }
      } else {
        return {
          name: 'api_server',
          status: 'fail',
          message: 'API server NOT listening on port 3000',
          timestamp: new Date(),
          critical: true,
        }
      }
    } catch (error) {
      return {
        name: 'api_server',
        status: 'fail',
        message: `Failed to check API server: ${error}`,
        timestamp: new Date(),
        critical: true,
      }
    }
  }

  /**
   * Check bot ports 3001-3010
   */
  private async checkBotPorts(): Promise<HealthCheck> {
    try {
      const portChecks = await Promise.all(
        Array.from({ length: 10 }, (_, i) => i + 3001).map(async port => {
          try {
            const { stdout } = await execAsync(
              `ssh -i ~/.ssh/selectel root@185.161.67.53 'netstat -tulpn | grep ":${port}.*LISTEN"'`
            )
            return stdout.trim() ? port : null
          } catch {
            return null
          }
        })
      )

      const listeningPorts = portChecks.filter(port => port !== null)
      const expectedPorts = 10

      if (listeningPorts.length === expectedPorts) {
        return {
          name: 'bot_ports',
          status: 'pass',
          message: `All ${expectedPorts} bot ports are listening`,
          timestamp: new Date(),
          critical: false,
        }
      } else if (listeningPorts.length >= 5) {
        return {
          name: 'bot_ports',
          status: 'warn',
          message: `${listeningPorts.length}/${expectedPorts} bot ports are listening`,
          timestamp: new Date(),
          critical: false,
        }
      } else {
        return {
          name: 'bot_ports',
          status: 'fail',
          message: `Only ${listeningPorts.length}/${expectedPorts} bot ports are listening`,
          timestamp: new Date(),
          critical: true,
        }
      }
    } catch (error) {
      return {
        name: 'bot_ports',
        status: 'fail',
        message: `Failed to check bot ports: ${error}`,
        timestamp: new Date(),
        critical: true,
      }
    }
  }

  /**
   * Check domain accessibility
   */
  private async checkDomainAccessibility(): Promise<HealthCheck> {
    try {
      const startTime = Date.now()
      const { stdout } = await execAsync(
        'curl -s -o /dev/null -w "%{http_code}" "http://test-render-farm.ru/" --max-time 10'
      )
      const responseTime = Date.now() - startTime
      const httpStatus = stdout.trim()

      if (httpStatus === '200') {
        const status =
          responseTime > this.config.alertThresholds.responseTimeMs
            ? 'warn'
            : 'pass'
        return {
          name: 'domain_accessibility',
          status,
          message: `Domain accessible (HTTP ${httpStatus}, ${responseTime}ms)`,
          timestamp: new Date(),
          critical: false,
        }
      } else if (httpStatus === '502') {
        return {
          name: 'domain_accessibility',
          status: 'fail',
          message: 'Domain returns 502 Bad Gateway - nginx/API server issue',
          timestamp: new Date(),
          critical: true,
        }
      } else {
        return {
          name: 'domain_accessibility',
          status: 'warn',
          message: `Domain returns HTTP ${httpStatus}`,
          timestamp: new Date(),
          critical: false,
        }
      }
    } catch (error) {
      return {
        name: 'domain_accessibility',
        status: 'fail',
        message: `Failed to check domain: ${error}`,
        timestamp: new Date(),
        critical: true,
      }
    }
  }

  /**
   * Check webhook configuration
   */
  private async checkWebhookConfiguration(): Promise<HealthCheck> {
    try {
      let webhooksConfigured = 0
      let totalTokens = 0

      for (let i = 1; i <= 10; i++) {
        try {
          const { stdout } = await execAsync(
            `ssh -i ~/.ssh/selectel root@185.161.67.53 'docker exec 999-multibots printenv | grep "BOT_TOKEN_${i}=" | cut -d"=" -f2'`
          )
          const token = stdout.trim()

          if (token) {
            totalTokens++

            const response = await fetch(
              `${telegramApiFor(token)}/getWebhookInfo`
            )
            const data = await response.json()

            if (data.result && data.result.url) {
              webhooksConfigured++
            }
          }
        } catch {
          // Token doesn't exist or API call failed, continue
        }
      }

      if (webhooksConfigured > 0) {
        const status = webhooksConfigured === totalTokens ? 'pass' : 'warn'
        return {
          name: 'webhook_config',
          status,
          message: `${webhooksConfigured}/${totalTokens} webhooks configured`,
          timestamp: new Date(),
          critical: false,
        }
      } else {
        return {
          name: 'webhook_config',
          status: 'fail',
          message: 'No webhooks configured for any bots',
          timestamp: new Date(),
          critical: true,
        }
      }
    } catch (error) {
      return {
        name: 'webhook_config',
        status: 'fail',
        message: `Failed to check webhooks: ${error}`,
        timestamp: new Date(),
        critical: false,
      }
    }
  }

  /**
   * Check webhook server repository configuration
   */
  private async checkWebhookServerConfig(): Promise<HealthCheck> {
    try {
      const { stdout } = await execAsync(
        'ssh -i ~/.ssh/selectel root@185.161.67.53 \'grep "REPO_PATH" /root/webhook-deploy-server.js 2>/dev/null || echo ""\''
      )
      const repoPath = stdout.trim()

      if (repoPath.includes('999-agents-telegraf')) {
        return {
          name: 'webhook_server_config',
          status: 'pass',
          message:
            'Webhook server correctly configured for 999-agents-telegraf',
          timestamp: new Date(),
          critical: false,
        }
      } else if (repoPath.includes('999-agents-vibecoder')) {
        return {
          name: 'webhook_server_config',
          status: 'warn',
          message:
            'Webhook server pointing to wrong repo: 999-agents-vibecoder',
          timestamp: new Date(),
          critical: false,
        }
      } else {
        return {
          name: 'webhook_server_config',
          status: 'warn',
          message: 'Webhook server configuration unclear',
          timestamp: new Date(),
          critical: false,
        }
      }
    } catch (error) {
      return {
        name: 'webhook_server_config',
        status: 'fail',
        message: `Failed to check webhook server config: ${error}`,
        timestamp: new Date(),
        critical: false,
      }
    }
  }

  /**
   * Check system resources
   */
  private async checkSystemResources(): Promise<HealthCheck> {
    try {
      const { stdout } = await execAsync(
        'ssh -i ~/.ssh/selectel root@185.161.67.53 \'df -h / | tail -1 | awk "{print \\$5}" | sed "s/%//"\''
      )
      const diskUsage = parseInt(stdout.trim())

      if (diskUsage < 80) {
        return {
          name: 'system_resources',
          status: 'pass',
          message: `Disk usage: ${diskUsage}%`,
          timestamp: new Date(),
          critical: false,
        }
      } else if (diskUsage < 90) {
        return {
          name: 'system_resources',
          status: 'warn',
          message: `High disk usage: ${diskUsage}%`,
          timestamp: new Date(),
          critical: false,
        }
      } else {
        return {
          name: 'system_resources',
          status: 'fail',
          message: `Critical disk usage: ${diskUsage}%`,
          timestamp: new Date(),
          critical: true,
        }
      }
    } catch (error) {
      return {
        name: 'system_resources',
        status: 'warn',
        message: `Failed to check system resources: ${error}`,
        timestamp: new Date(),
        critical: false,
      }
    }
  }

  /**
   * Analyze health check results and send alerts
   */
  private async analyzeAndAlert(checks: HealthCheck[]): Promise<void> {
    const criticalIssues = checks.filter(
      check => check.status === 'fail' && check.critical
    )
    const warnings = checks.filter(check => check.status === 'warn')

    // Send critical alerts
    for (const issue of criticalIssues) {
      const alertKey = `${issue.name}_critical`
      if (!this.alertsSent.has(alertKey)) {
        await this.sendAlert(`🚨 CRITICAL: ${issue.message}`, true)
        this.alertsSent.add(alertKey)
      }
    }

    // Send warning alerts (less frequently)
    if (warnings.length > 0) {
      const warningKey = `warnings_${Date.now().toString().slice(0, -5)}` // 5-minute buckets
      if (!this.alertsSent.has(warningKey)) {
        await this.sendAlert(
          `⚠️ Warnings detected: ${warnings.map(w => w.message).join(', ')}`,
          false
        )
        this.alertsSent.add(warningKey)
      }
    }

    // Clear alert flags if issues are resolved
    for (const check of checks) {
      if (check.status === 'pass') {
        this.alertsSent.delete(`${check.name}_critical`)
      }
    }
  }

  /**
   * Send alert notification
   */
  private async sendAlert(message: string, critical: boolean): Promise<void> {
    const fullMessage = `🚨 PRODUCTION ALERT 🚨\n\n${message}\n\nTime: ${new Date().toISOString()}\nServer: 185.161.67.53`

    // Console alert
    console.error(
      critical ? `🚨 CRITICAL ALERT: ${message}` : `⚠️ WARNING: ${message}`
    )

    // Telegram alert
    if (
      this.config.notifications.telegramBotToken &&
      this.config.notifications.alertChatId
    ) {
      try {
        await fetch(
          `${telegramApiFor(this.config.notifications.telegramBotToken)}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: this.config.notifications.alertChatId,
              text: fullMessage,
              parse_mode: 'HTML',
            }),
          }
        )
      } catch (error) {
        console.error('Failed to send Telegram alert:', error)
      }
    }
  }

  /**
   * Display health summary
   */
  private displayHealthSummary(checks: HealthCheck[]): void {
    const passed = checks.filter(c => c.status === 'pass').length
    const warned = checks.filter(c => c.status === 'warn').length
    const failed = checks.filter(c => c.status === 'fail').length

    console.log(
      `\n📊 Health Summary: ${passed} passed, ${warned} warnings, ${failed} failed`
    )

    for (const check of checks) {
      const icon =
        check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'
      console.log(`${icon} ${check.name}: ${check.message}`)
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): { overall: string; checks: HealthCheck[] } {
    const recentChecks = this.healthHistory.filter(
      check => Date.now() - check.timestamp.getTime() < 300000 // Last 5 minutes
    )

    const hasCritical = recentChecks.some(
      check => check.status === 'fail' && check.critical
    )
    const hasFailure = recentChecks.some(check => check.status === 'fail')
    const hasWarning = recentChecks.some(check => check.status === 'warn')

    let overall = 'healthy'
    if (hasCritical) overall = 'critical'
    else if (hasFailure) overall = 'degraded'
    else if (hasWarning) overall = 'warning'

    return { overall, checks: recentChecks }
  }
}

// CLI interface
if (
  typeof process !== 'undefined' &&
  process.argv.length > 2 &&
  process.argv[1]?.endsWith('production-monitor.ts')
) {
  const monitor = new ProductionMonitor()
  const command = process.argv[2]

  switch (command) {
    case 'check':
      monitor.runHealthChecks().then(() => process.exit(0))
      break
    case 'monitor':
      monitor.startMonitoring()
      break
    default:
      console.log(
        'Usage: bun run src/utils/production-monitor.ts {check|monitor}'
      )
      process.exit(1)
  }
}
