#!/usr/bin/env node

/**
 * Real-time Bot Farm Monitor
 * Continuously monitors bot farm health and alerts on issues
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const BotFarmValidator = require('./bot-farm-validation-suite');

class RealTimeMonitor {
  constructor(intervalMs = 30000) { // 30 seconds default
    this.intervalMs = intervalMs;
    this.validator = new BotFarmValidator();
    this.isMonitoring = false;
    this.previousResults = null;
    this.alertThreshold = {
      healthScore: 80,
      activeBots: 8,
      errorIncrease: 3
    };
  }

  async startMonitoring() {
    console.log(`🚀 Starting real-time monitoring (${this.intervalMs/1000}s intervals)...`);
    this.isMonitoring = true;

    while (this.isMonitoring) {
      try {
        const results = await this.validator.runFullValidation();
        this.analyzeChanges(results);
        this.previousResults = results;

        // Coordinate with hive
        await this.notifyHiveCollective(results);

        console.log(`⏰ Next check in ${this.intervalMs/1000} seconds...`);
        await this.sleep(this.intervalMs);

      } catch (error) {
        console.error('❌ Monitoring cycle failed:', error);
        await this.sleep(5000); // Short retry delay
      }
    }
  }

  analyzeChanges(currentResults) {
    if (!this.previousResults) {
      console.log('📋 Baseline established');
      return;
    }

    const changes = this.detectChanges(this.previousResults, currentResults);

    if (changes.length > 0) {
      console.log('\n🔄 CHANGES DETECTED:');
      changes.forEach(change => console.log(`  ${change}`));
    }

    this.checkAlerts(currentResults);
  }

  detectChanges(previous, current) {
    const changes = [];

    if (previous.containerHealth.status !== current.containerHealth.status) {
      changes.push(`🐳 Container status: ${previous.containerHealth.status} → ${current.containerHealth.status}`);
    }

    if (previous.networking.externalPort !== current.networking.externalPort) {
      changes.push(`🌐 External port: ${previous.networking.externalPort} → ${current.networking.externalPort}`);
    }

    if (previous.errors.length !== current.errors.length) {
      changes.push(`❌ Errors: ${previous.errors.length} → ${current.errors.length}`);
    }

    const prevActiveBots = Object.values(previous.networking || {}).filter(s => s === 'ACTIVE').length;
    const currActiveBots = Object.values(current.networking || {}).filter(s => s === 'ACTIVE').length;

    if (prevActiveBots !== currActiveBots) {
      changes.push(`🤖 Active bots: ${prevActiveBots}/10 → ${currActiveBots}/10`);
    }

    return changes;
  }

  checkAlerts(results) {
    const alerts = [];

    if (results.overallHealth < this.alertThreshold.healthScore) {
      alerts.push(`🚨 CRITICAL: Health score below threshold (${results.overallHealth}% < ${this.alertThreshold.healthScore}%)`);
    }

    const activeBots = Object.values(results.networking || {}).filter(s => s === 'ACTIVE').length;
    if (activeBots < this.alertThreshold.activeBots) {
      alerts.push(`⚠️ WARNING: Only ${activeBots}/10 bots active (< ${this.alertThreshold.activeBots})`);
    }

    if (results.errors.length >= this.alertThreshold.errorIncrease) {
      alerts.push(`❌ ERROR SPIKE: ${results.errors.length} errors detected`);
    }

    if (results.containerHealth.status !== 'RUNNING') {
      alerts.push('🚨 CRITICAL: Container not running!');
    }

    if (alerts.length > 0) {
      console.log('\n🚨 ALERTS:');
      alerts.forEach(alert => console.log(`  ${alert}`));
      this.triggerEmergencyProtocol(alerts);
    }
  }

  async triggerEmergencyProtocol(alerts) {
    console.log('\n🚨 TRIGGERING EMERGENCY PROTOCOL...');

    try {
      // Notify hive collective of emergency
      const notifyCmd = `npx claude-flow@alpha hooks notify --message "EMERGENCY: Bot farm alerts detected - ${alerts.length} issues"`;
      await execAsync(notifyCmd);

      // Save emergency report
      const emergencyReport = {
        timestamp: new Date().toISOString(),
        alerts: alerts,
        lastResults: this.previousResults,
        emergencyActions: [
          'Hive collective notified',
          'Emergency report generated',
          'Awaiting diagnostic agent response'
        ]
      };

      const fs = require('fs').promises;
      await fs.writeFile(
        `/Users/playra/999-agents-telegraf/tests/validation/emergency-${Date.now()}.json`,
        JSON.stringify(emergencyReport, null, 2)
      );

      console.log('📋 Emergency protocol activated successfully');
    } catch (error) {
      console.error('❌ Emergency protocol failed:', error);
    }
  }

  async notifyHiveCollective(results) {
    try {
      const healthStatus = results.overallHealth > 80 ? 'HEALTHY' :
                          results.overallHealth > 60 ? 'DEGRADED' : 'CRITICAL';

      const message = `Bot Farm Status: ${healthStatus} (${results.overallHealth}%) - ${Object.values(results.networking || {}).filter(s => s === 'ACTIVE').length}/10 bots active`;

      await execAsync(`npx claude-flow@alpha hooks post-edit --memory-key "validation/health-status" --file "bot-farm-status"`);

    } catch (error) {
      // Silent fail for coordination - don't interrupt monitoring
      console.warn('⚠️ Hive coordination failed (non-critical)');
    }
  }

  async stopMonitoring() {
    console.log('🛑 Stopping monitoring...');
    this.isMonitoring = false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI usage
if (require.main === module) {
  const intervalSec = parseInt(process.argv[2]) || 30;
  const monitor = new RealTimeMonitor(intervalSec * 1000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received shutdown signal...');
    await monitor.stopMonitoring();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received termination signal...');
    await monitor.stopMonitoring();
    process.exit(0);
  });

  monitor.startMonitoring().catch(error => {
    console.error('💥 Monitor crashed:', error);
    process.exit(1);
  });
}

module.exports = RealTimeMonitor;