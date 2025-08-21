#!/usr/bin/env node

/**
 * 🎬 SELF-HEALING CODE SYSTEM - COMPLETE DEMO
 * Full demonstration of autonomous GitHub Issues resolution
 */

const SmartFixesSelfHealer = require('./.claude-flow/self-healing/smart-fixes-integration.js')

class SelfHealingDemo {
  constructor() {
    this.healer = new SmartFixesSelfHealer({
      port: 3001,
      repoOwner: 'gHashTag',
      repoName: '999-multibots-telegraf'
    })
    
    this.demoScenarios = [
      {
        name: 'Console.log Performance Bug',
        issue: {
          number: 1001,
          title: 'Bug: Console.log statements causing performance issues in production',
          body: 'Found multiple console.log statements in src/ directory that are slowing down the application and cluttering production logs. Need automated cleanup.',
          labels: [{ name: 'bug' }, { name: 'performance' }, { name: 'high-priority' }]
        },
        expectedOutcome: 'auto-heal'
      },
      {
        name: 'Import Optimization Issue',
        issue: {
          number: 1002,
          title: 'Improvement: Optimize import statements to reduce bundle size',
          body: 'Multiple files have unused imports that are increasing bundle size. Automatic optimization needed.',
          labels: [{ name: 'enhancement' }, { name: 'performance' }, { name: 'technical-debt' }]
        },
        expectedOutcome: 'auto-heal'
      },
      {
        name: 'Complex Bug Requiring Human Review',
        issue: {
          number: 1003,
          title: 'Bug: User authentication fails intermittently with complex race condition',
          body: 'Users report random login failures. Appears to be a complex race condition in the authentication service that requires detailed investigation.',
          labels: [{ name: 'bug' }, { name: 'critical' }, { name: 'authentication' }]
        },
        expectedOutcome: 'manual-review'
      }
    ]
  }

  async start() {
    console.clear()
    console.log('\n🎬 SELF-HEALING CODE SYSTEM - LIVE DEMONSTRATION')
    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('🚀 Autonomous GitHub Issues Resolution + Smart Fixes Integration')
    console.log('')
    
    // Start the healing system
    this.healer.start()
    
    // Wait for system to initialize
    console.log('⏳ Initializing self-healing system...')
    await this.sleep(3000)
    
    // Run demo scenarios
    await this.runDemoScenarios()
    
    // Keep server running for interactive testing
    console.log('\n🎛️  INTERACTIVE MODE')
    console.log('═══════════════════════════════════════')
    console.log('🌐 Dashboard: http://localhost:3001')
    console.log('📊 Health API: http://localhost:3001/health')
    console.log('🔧 Manual Healing: POST http://localhost:3001/heal/{issue_number}')
    console.log('')
    console.log('Press Ctrl+C to stop the demo')
  }

  async runDemoScenarios() {
    console.log('\n🎭 RUNNING DEMO SCENARIOS')
    console.log('═══════════════════════════════════════')
    
    for (let i = 0; i < this.demoScenarios.length; i++) {
      const scenario = this.demoScenarios[i]
      
      console.log(`\n📋 SCENARIO ${i + 1}: ${scenario.name}`)
      console.log('─────────────────────────────────────────────')
      console.log(`Issue #${scenario.issue.number}: ${scenario.issue.title}`)
      console.log(`Expected: ${scenario.expectedOutcome}`)
      console.log('')
      
      // Process the issue
      await this.healer.processIssue(scenario.issue)
      
      // Wait for processing
      console.log(`⏳ Waiting for healing process...`)
      await this.sleep(8000)
      
      console.log(`✅ Scenario ${i + 1} completed`)
      
      if (i < this.demoScenarios.length - 1) {
        console.log(`\n⏸️  Pausing 5 seconds before next scenario...`)
        await this.sleep(5000)
      }
    }
    
    console.log('\n🎉 ALL DEMO SCENARIOS COMPLETED')
    console.log('═══════════════════════════════════════')
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Advanced Demo with Metrics
class MetricsCollector {
  constructor() {
    this.startTime = Date.now()
    this.metrics = {
      issuesProcessed: 0,
      autoHealed: 0,
      manualReview: 0,
      avgResponseTime: 0,
      healthScoreImprovements: []
    }
  }

  recordIssueProcessed(responseTime) {
    this.metrics.issuesProcessed++
    this.updateAvgResponseTime(responseTime)
  }

  recordAutoHealed() {
    this.metrics.autoHealed++
  }

  recordManualReview() {
    this.metrics.manualReview++
  }

  recordHealthImprovement(improvement) {
    this.metrics.healthScoreImprovements.push(improvement)
  }

  updateAvgResponseTime(responseTime) {
    const total = this.metrics.avgResponseTime * (this.metrics.issuesProcessed - 1) + responseTime
    this.metrics.avgResponseTime = Math.round(total / this.metrics.issuesProcessed)
  }

  generateReport() {
    const runtime = Math.round((Date.now() - this.startTime) / 1000)
    const autoHealRate = this.metrics.issuesProcessed > 0 
      ? Math.round((this.metrics.autoHealed / this.metrics.issuesProcessed) * 100)
      : 0
    
    const avgHealthImprovement = this.metrics.healthScoreImprovements.length > 0
      ? (this.metrics.healthScoreImprovements.reduce((a, b) => a + b, 0) / this.metrics.healthScoreImprovements.length).toFixed(1)
      : 0
    
    return `
🏆 SELF-HEALING SYSTEM PERFORMANCE REPORT
═══════════════════════════════════════════════════════════════

📊 EXECUTION METRICS:
• Runtime: ${runtime} seconds
• Issues Processed: ${this.metrics.issuesProcessed}
• Auto-Healed: ${this.metrics.autoHealed}
• Manual Review Required: ${this.metrics.manualReview}
• Auto-Heal Success Rate: ${autoHealRate}%
• Average Response Time: ${this.metrics.avgResponseTime}ms

📈 IMPACT ANALYSIS:
• Average Health Score Improvement: +${avgHealthImprovement}
• Total Fixes Applied: ${this.metrics.autoHealed * 3} (estimated)
• Developer Time Saved: ~${this.metrics.autoHealed * 30} minutes

🚀 SYSTEM STATUS: ${autoHealRate >= 70 ? '🟢 EXCELLENT' : autoHealRate >= 50 ? '🟡 GOOD' : '🔴 NEEDS OPTIMIZATION'}

═══════════════════════════════════════════════════════════════`
  }
}

// Production-Ready Configuration
class ProductionConfig {
  static getConfig() {
    return {
      // GitHub Integration
      github: {
        token: process.env.GITHUB_TOKEN,
        webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
        owner: process.env.GITHUB_OWNER || 'gHashTag',
        repo: process.env.GITHUB_REPO || '999-multibots-telegraf'
      },
      
      // Healing System Configuration
      healing: {
        autoHealThreshold: 80, // Confidence threshold for auto-healing
        maxConcurrentHealing: 3, // Max simultaneous healing processes
        backoffDelay: 5000, // Delay between failed attempts
        maxRetries: 3, // Max retry attempts for failed healing
        healthCheckInterval: 300000, // 5 minutes
        queueProcessingInterval: 10000 // 10 seconds
      },
      
      // Smart Fixes Configuration
      smartFixes: {
        autoFixCategories: ['code-quality', 'performance', 'style'],
        excludePatterns: ['test/', 'node_modules/', '.git/'],
        backupBeforeFix: true,
        runTestsAfterFix: true
      },
      
      // Monitoring & Alerts
      monitoring: {
        slackWebhook: process.env.SLACK_WEBHOOK_URL,
        emailAlerts: process.env.ALERT_EMAIL,
        healthScoreThreshold: 7.0, // Alert if below this score
        errorRateThreshold: 15 // Alert if error rate above 15%
      }
    }
  }
}

// Main Demo Runner
if (require.main === module) {
  const demo = new SelfHealingDemo()
  const metrics = new MetricsCollector()
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down Self-Healing System...')
    console.log(metrics.generateReport())
    console.log('\n👋 Thanks for trying the Self-Healing Code System!')
    process.exit(0)
  })
  
  // Start the demo
  demo.start().catch(error => {
    console.error('❌ Demo failed:', error)
    process.exit(1)
  })
  
  // Show configuration info
  console.log('\n⚙️  PRODUCTION CONFIGURATION AVAILABLE')
  console.log('═══════════════════════════════════════════')
  console.log('Set these environment variables for production:')
  console.log('• GITHUB_TOKEN - GitHub API token')
  console.log('• GITHUB_WEBHOOK_SECRET - Webhook secret')
  console.log('• GITHUB_OWNER - Repository owner')
  console.log('• GITHUB_REPO - Repository name')
  console.log('• SLACK_WEBHOOK_URL - Slack notifications')
  console.log('• ALERT_EMAIL - Email for alerts')
}