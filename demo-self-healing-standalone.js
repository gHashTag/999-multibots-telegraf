#!/usr/bin/env node

/**
 * 🔮 SELF-HEALING CODE SYSTEM - STANDALONE DEMO
 * Complete demonstration without external dependencies
 */

const express = require('express')
const crypto = require('crypto')
const { promises: fs } = require('fs')
const path = require('path')

class SelfHealingStandaloneDemo {
  constructor() {
    this.app = express()
    this.app.use(express.json())
    
    this.processedIssues = new Set()
    this.healingQueue = []
    this.metrics = {
      issuesProcessed: 0,
      autoHealed: 0,
      manualReview: 0,
      totalHealthImprovement: 0,
      startTime: Date.now()
    }
    
    this.setupRoutes()
    this.startBackgroundProcessor()
  }

  setupRoutes() {
    // Main dashboard
    this.app.get('/', (req, res) => {
      res.send(this.generateDashboard())
    })

    // Health API
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'operational',
        system: 'Self-Healing Code System v1.0',
        ...this.metrics,
        uptime: Math.floor((Date.now() - this.metrics.startTime) / 1000),
        queueLength: this.healingQueue.length
      })
    })

    // Manual issue simulation
    this.app.post('/simulate/:scenario', async (req, res) => {
      const scenario = this.getDemoScenario(req.params.scenario)
      if (scenario) {
        await this.processIssue(scenario.issue)
        res.json({ message: `Simulated ${scenario.name}`, issue: scenario.issue })
      } else {
        res.status(404).json({ error: 'Scenario not found' })
      }
    })

    // Live metrics endpoint
    this.app.get('/metrics', (req, res) => {
      res.json({
        ...this.metrics,
        uptime: Math.floor((Date.now() - this.metrics.startTime) / 1000),
        successRate: this.metrics.issuesProcessed > 0 
          ? Math.round((this.metrics.autoHealed / this.metrics.issuesProcessed) * 100)
          : 0,
        avgHealthImprovement: this.metrics.issuesProcessed > 0
          ? (this.metrics.totalHealthImprovement / this.metrics.issuesProcessed).toFixed(1)
          : 0
      })
    })
  }

  async processIssue(issue) {
    console.log(`\n🔍 PROCESSING ISSUE #${issue.number}`)
    console.log(`📋 Title: ${issue.title}`)
    console.log(`🏷️  Labels: ${issue.labels.map(l => l.name).join(', ')}`)
    
    this.metrics.issuesProcessed++
    
    // 1. Classify the issue
    const classification = await this.classifyIssue(issue)
    console.log(`🎯 Classification: ${classification.type} (${classification.confidence}% confidence)`)
    
    // 2. Assess healing potential
    const healability = await this.assessHealability(issue, classification)
    console.log(`🔧 Auto-healable: ${healability.canAutoHeal ? 'YES' : 'NO'} (${healability.confidence}% confidence)`)
    
    // 3. Add to queue or mark for manual review
    if (healability.canAutoHeal && healability.confidence > 70) {
      this.healingQueue.push({
        issue,
        classification,
        healability,
        timestamp: Date.now()
      })
      console.log(`✅ Added to healing queue`)
      
      // Simulate immediate processing for demo
      setTimeout(() => this.executeHealing(issue, classification, healability), 2000)
    } else {
      this.metrics.manualReview++
      console.log(`📋 Marked for manual review: ${healability.reason}`)
    }
    
    console.log(`─────────────────────────────────────────`)
  }

  async classifyIssue(issue) {
    const title = issue.title.toLowerCase()
    const body = (issue.body || '').toLowerCase()
    const text = `${title} ${body}`
    
    // Smart pattern matching
    const patterns = {
      bug: ['bug', 'error', 'crash', 'fail', 'broken', 'console.log', 'exception', 'not working'],
      feature: ['feature', 'enhancement', 'add', 'implement', 'new'],
      improvement: ['improve', 'optimize', 'performance', 'refactor', 'upgrade', 'cleanup']
    }
    
    let scores = { bug: 0, feature: 0, improvement: 0 }
    
    Object.entries(patterns).forEach(([type, keywords]) => {
      keywords.forEach(keyword => {
        if (text.includes(keyword)) scores[type] += 1
      })
    })
    
    const maxType = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b)
    const confidence = Math.min(95, 50 + scores[maxType] * 15)
    
    return { type: maxType, confidence }
  }

  async assessHealability(issue, classification) {
    const title = issue.title.toLowerCase()
    const body = (issue.body || '').toLowerCase()
    
    const autoHealablePatterns = [
      { pattern: 'console.log', confidence: 95, reason: 'Console.log → Logger replacement' },
      { pattern: 'import', confidence: 85, reason: 'Import optimization' },
      { pattern: 'lint', confidence: 90, reason: 'Code linting fixes' },
      { pattern: 'format', confidence: 95, reason: 'Code formatting' },
      { pattern: 'type error', confidence: 75, reason: 'TypeScript improvements' },
      { pattern: 'performance', confidence: 80, reason: 'Performance optimizations' }
    ]
    
    for (const { pattern, confidence, reason } of autoHealablePatterns) {
      if (title.includes(pattern) || body.includes(pattern)) {
        return { canAutoHeal: true, confidence, reason }
      }
    }
    
    return { 
      canAutoHeal: false, 
      confidence: 30, 
      reason: 'Complex issue requiring human analysis' 
    }
  }

  async executeHealing(issue, classification, healability) {
    console.log(`\n🚀 EXECUTING HEALING for Issue #${issue.number}`)
    console.log(`🔧 Strategy: ${healability.reason}`)
    
    try {
      // Simulate Smart Fixes integration
      console.log(`  🤖 Integrating with Smart Fixes Engine...`)
      await this.sleep(1000)
      
      console.log(`  📊 Running code analysis...`)
      const healthBefore = 7.2
      await this.sleep(1500)
      
      console.log(`  ⚡ Applying automatic fixes...`)
      await this.sleep(2000)
      
      console.log(`  🧪 Running validation tests...`)
      await this.sleep(1000)
      
      const healthAfter = healthBefore + (Math.random() * 1.5) + 0.5
      const improvement = healthAfter - healthBefore
      
      console.log(`  📈 Health score: ${healthBefore} → ${healthAfter.toFixed(1)} (+${improvement.toFixed(1)})`)
      
      // Simulate PR creation
      const prNumber = Math.floor(Math.random() * 1000) + 100
      console.log(`  📝 Created PR #${prNumber}: Auto-fix for issue #${issue.number}`)
      
      this.metrics.autoHealed++
      this.metrics.totalHealthImprovement += improvement
      
      console.log(`✅ HEALING COMPLETED SUCCESSFULLY`)
      console.log(`   📋 Files modified: ${Math.floor(Math.random() * 5) + 1}`)
      console.log(`   🎯 Confidence: ${healability.confidence}%`)
      console.log(`   ⏱️  Total time: ${Math.floor(Math.random() * 30) + 15} seconds`)
      
    } catch (error) {
      console.log(`❌ HEALING FAILED: ${error.message}`)
      this.metrics.manualReview++
    }
    
    console.log(`═══════════════════════════════════════════════`)
  }

  async startBackgroundProcessor() {
    console.log(`🔄 Background healing processor started`)
    
    // Process queue every 5 seconds
    setInterval(() => {
      if (this.healingQueue.length > 0) {
        console.log(`\n⚡ Processing healing queue (${this.healingQueue.length} items)`)
        // In real implementation, would process queue items
      }
    }, 5000)
  }

  getDemoScenario(scenarioName) {
    const scenarios = {
      'console-bug': {
        name: 'Console.log Performance Bug',
        issue: {
          number: 1001,
          title: 'Bug: Console.log statements causing performance issues',
          body: 'Found multiple console.log statements in production code causing performance degradation.',
          labels: [{ name: 'bug' }, { name: 'performance' }]
        }
      },
      'import-optimization': {
        name: 'Import Optimization',
        issue: {
          number: 1002,
          title: 'Improvement: Optimize import statements to reduce bundle size',
          body: 'Multiple files have unused imports increasing bundle size.',
          labels: [{ name: 'enhancement' }, { name: 'performance' }]
        }
      },
      'complex-bug': {
        name: 'Complex Authentication Bug',
        issue: {
          number: 1003,
          title: 'Bug: User authentication fails with race condition',
          body: 'Complex race condition in authentication service requires investigation.',
          labels: [{ name: 'bug' }, { name: 'critical' }]
        }
      }
    }
    
    return scenarios[scenarioName]
  }

  generateDashboard() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000)
    const successRate = this.metrics.issuesProcessed > 0 
      ? Math.round((this.metrics.autoHealed / this.metrics.issuesProcessed) * 100)
      : 0
    const avgImprovement = this.metrics.issuesProcessed > 0
      ? (this.metrics.totalHealthImprovement / this.metrics.issuesProcessed).toFixed(1)
      : 0

    return `
<!DOCTYPE html>
<html>
<head>
    <title>🔮 Self-Healing Code System - Live Demo</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px;
        }
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 3em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .header p {
            font-size: 1.2em;
            opacity: 0.9;
        }
        .dashboard {
            background: rgba(255,255,255,0.95);
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            backdrop-filter: blur(10px);
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            box-shadow: 0 10px 20px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .metric:hover {
            transform: translateY(-5px);
        }
        .metric-number {
            font-size: 3em;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .metric-label {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .demo-controls {
            background: #f8f9fa;
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            border-left: 5px solid #28a745;
        }
        .demo-controls h3 {
            margin-bottom: 15px;
            color: #28a745;
        }
        .scenario-buttons {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
        }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-warning { background: #ffc107; color: black; }
        .btn-danger { background: #dc3545; color: white; }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        .status-panel {
            background: #e9ecef;
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
        }
        .status-panel h3 {
            margin-bottom: 15px;
            color: #495057;
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .status-item {
            background: white;
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }
        .live-log {
            background: #2d3748;
            color: #e2e8f0;
            padding: 20px;
            border-radius: 10px;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 14px;
            max-height: 300px;
            overflow-y: auto;
        }
        .footer {
            text-align: center;
            color: white;
            margin-top: 30px;
            opacity: 0.8;
        }
        @media (max-width: 768px) {
            .metrics { grid-template-columns: 1fr; }
            .scenario-buttons { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔮 Self-Healing Code System</h1>
            <p>Autonomous GitHub Issues Resolution with Smart Fixes Integration</p>
        </div>

        <div class="dashboard">
            <div class="metrics">
                <div class="metric">
                    <div class="metric-number">${this.metrics.issuesProcessed}</div>
                    <div class="metric-label">Issues Processed</div>
                </div>
                <div class="metric">
                    <div class="metric-number">${this.metrics.autoHealed}</div>
                    <div class="metric-label">Auto-Healed</div>
                </div>
                <div class="metric">
                    <div class="metric-number">${successRate}%</div>
                    <div class="metric-label">Success Rate</div>
                </div>
                <div class="metric">
                    <div class="metric-number">+${avgImprovement}</div>
                    <div class="metric-label">Avg Health Boost</div>
                </div>
            </div>

            <div class="demo-controls">
                <h3>🎬 Live Demo Controls</h3>
                <p>Click buttons below to simulate different issue types and watch the self-healing process in action:</p>
                <div class="scenario-buttons" style="margin-top: 15px;">
                    <button class="btn btn-success" onclick="simulateScenario('console-bug')">
                        🐛 Console.log Bug
                    </button>
                    <button class="btn btn-primary" onclick="simulateScenario('import-optimization')">
                        ⚡ Import Optimization
                    </button>
                    <button class="btn btn-danger" onclick="simulateScenario('complex-bug')">
                        🔥 Complex Bug
                    </button>
                    <a href="/metrics" class="btn btn-warning">📊 Live Metrics JSON</a>
                </div>
            </div>

            <div class="status-panel">
                <h3>🎛️ System Status</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <strong>⏱️ Uptime</strong><br>
                        ${Math.floor(uptime / 60)}m ${uptime % 60}s
                    </div>
                    <div class="status-item">
                        <strong>🔄 Queue Length</strong><br>
                        ${this.healingQueue.length} items
                    </div>
                    <div class="status-item">
                        <strong>🏥 Health Score</strong><br>
                        8.5/10
                    </div>
                    <div class="status-item">
                        <strong>🚀 Status</strong><br>
                        <span style="color: #28a745;">● Operational</span>
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <h3>📊 Real-Time Activity Log</h3>
                <div class="live-log" id="activityLog">
[${new Date().toLocaleTimeString()}] 🔮 Self-Healing Code System v1.0 initialized
[${new Date().toLocaleTimeString()}] 🚀 Smart Fixes Engine integration: ACTIVE
[${new Date().toLocaleTimeString()}] 🎯 GitHub Issues monitoring: READY
[${new Date().toLocaleTimeString()}] ⚡ Background healing processor: STARTED
[${new Date().toLocaleTimeString()}] 🎛️ Dashboard server: OPERATIONAL on port 3000
                </div>
            </div>
        </div>

        <div class="footer">
            <p>🤖 Powered by Smart Fixes Engine + Claude Collective Intelligence</p>
            <p>Built for autonomous code improvement and self-healing systems</p>
        </div>
    </div>

    <script>
        async function simulateScenario(scenario) {
            const log = document.getElementById('activityLog');
            const timestamp = new Date().toLocaleTimeString();
            log.innerHTML += '\\n[' + timestamp + '] 🎬 Simulating scenario: ' + scenario;
            log.scrollTop = log.scrollHeight;

            try {
                const response = await fetch('/simulate/' + scenario, { method: 'POST' });
                const result = await response.json();
                
                log.innerHTML += '\\n[' + timestamp + '] ✅ Scenario executed: ' + result.message;
                log.innerHTML += '\\n[' + timestamp + '] 📋 Processing issue #' + result.issue.number;
                
                // Simulate processing updates
                setTimeout(() => {
                    log.innerHTML += '\\n[' + new Date().toLocaleTimeString() + '] 🔍 Issue analysis completed';
                    log.scrollTop = log.scrollHeight;
                }, 2000);
                
                setTimeout(() => {
                    log.innerHTML += '\\n[' + new Date().toLocaleTimeString() + '] 🤖 Smart Fixes integration active';
                    log.scrollTop = log.scrollHeight;
                }, 4000);
                
                setTimeout(() => {
                    log.innerHTML += '\\n[' + new Date().toLocaleTimeString() + '] ✅ Auto-healing completed successfully';
                    log.scrollTop = log.scrollHeight;
                    location.reload(); // Refresh to update metrics
                }, 6000);
                
            } catch (error) {
                log.innerHTML += '\\n[' + timestamp + '] ❌ Error: ' + error.message;
            }
            
            log.scrollTop = log.scrollHeight;
        }

        // Auto-refresh metrics every 30 seconds
        setInterval(() => {
            fetch('/metrics')
                .then(response => response.json())
                .then(metrics => {
                    // Update metrics in real-time if needed
                    console.log('Updated metrics:', metrics);
                });
        }, 30000);
    </script>
</body>
</html>`
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  start(port = 3000) {
    this.app.listen(port, () => {
      console.log(`\n🔮 SELF-HEALING CODE SYSTEM - STANDALONE DEMO`)
      console.log(`═══════════════════════════════════════════════════════════════`)
      console.log(`🚀 Server running on: http://localhost:${port}`)
      console.log(`📊 Health API: http://localhost:${port}/health`)
      console.log(`📈 Live Metrics: http://localhost:${port}/metrics`)
      console.log(``)
      console.log(`🎬 DEMO SCENARIOS:`)
      console.log(`• Console.log Bug: POST /simulate/console-bug`)
      console.log(`• Import Optimization: POST /simulate/import-optimization`)
      console.log(`• Complex Bug: POST /simulate/complex-bug`)
      console.log(``)
      console.log(`🎯 Ready for self-healing demonstrations!`)
      console.log(``)
      
      // Auto-run demo scenarios
      this.runAutoDemos()
    })
  }

  async runAutoDemos() {
    console.log(`🎪 Starting automated demo sequence...`)
    
    const scenarios = ['console-bug', 'import-optimization', 'complex-bug']
    
    for (let i = 0; i < scenarios.length; i++) {
      setTimeout(async () => {
        const scenario = this.getDemoScenario(scenarios[i])
        console.log(`\n🎬 AUTO-DEMO ${i + 1}: ${scenario.name}`)
        await this.processIssue(scenario.issue)
      }, (i + 1) * 10000) // Run every 10 seconds
    }
  }
}

// Launch the demo
if (require.main === module) {
  const demo = new SelfHealingStandaloneDemo()
  demo.start(3000)
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\n\n🛑 Shutting down Self-Healing System...`)
    console.log(`📊 Final metrics:`)
    console.log(`   • Issues processed: ${demo.metrics.issuesProcessed}`)
    console.log(`   • Auto-healed: ${demo.metrics.autoHealed}`)
    console.log(`   • Success rate: ${demo.metrics.issuesProcessed > 0 ? Math.round((demo.metrics.autoHealed / demo.metrics.issuesProcessed) * 100) : 0}%`)
    console.log(`\n👋 Thanks for trying the Self-Healing Code System!`)
    process.exit(0)
  })
}