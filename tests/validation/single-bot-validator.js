#!/usr/bin/env node

/**
 * Corrected Single Bot Validation Suite
 * Validates the actual single-bot architecture, not assumed 10-bot farm
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class SingleBotValidator {
  constructor() {
    this.sshCommand = "ssh -i ~/.ssh/selectel root@185.161.67.53";
    this.results = {
      timestamp: new Date().toISOString(),
      architecture: 'single-bot',
      containerHealth: {},
      applicationHealth: {},
      networking: {},
      portMapping: {},
      errors: [],
      recommendations: []
    };
  }

  async validateSingleBotSystem() {
    console.log('🤖 Validating SINGLE BOT system (corrected architecture)...');

    try {
      // Check container status
      const { stdout: containerStatus } = await execAsync(`${this.sshCommand} 'docker ps | grep 999-multibots'`);
      this.results.containerHealth.status = containerStatus.includes('Up') ? 'RUNNING' : 'STOPPED';
      this.results.containerHealth.uptime = this.extractUptime(containerStatus);

      // Check single bot process
      const { stdout: processes } = await execAsync(`${this.sshCommand} 'docker exec 999-multibots ps aux | grep "node.*bot"'`);
      this.results.applicationHealth.processCount = (processes.match(/node.*bot/g) || []).length;
      this.results.applicationHealth.isRunning = this.results.applicationHealth.processCount > 0;

      // Check internal port 2999 (where bot actually listens)
      const { stdout: internalTest } = await execAsync(`${this.sshCommand} 'docker exec 999-multibots curl -s -o /dev/null -w "%{http_code}" http://localhost:2999/health || echo "FAILED"'`);
      this.results.networking.internalPort2999 = internalTest.trim() === '200' ? 'ACCESSIBLE' : 'FAILED';

      // Check external port 3001 mapping
      const { stdout: externalTest } = await execAsync(`${this.sshCommand} 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || echo "FAILED"'`);
      this.results.networking.externalPort3001 = externalTest.trim() === '200' ? 'ACCESSIBLE' : 'FAILED';

      // Analyze port mapping
      this.analyzePortMapping();

      // Check application logs for health
      const { stdout: logs } = await execAsync(`${this.sshCommand} 'docker logs 999-multibots --tail 20'`);
      this.results.applicationHealth.hasErrors = logs.includes('ERROR') || logs.includes('error');
      this.results.applicationHealth.recentActivity = logs.includes(new Date().getHours().toString());

      console.log('✅ Single bot validation complete');
    } catch (error) {
      this.results.errors.push(`Single bot validation failed: ${error.message}`);
      console.error('❌ Single bot validation failed:', error.message);
    }
  }

  analyzePortMapping() {
    const internal2999 = this.results.networking.internalPort2999;
    const external3001 = this.results.networking.externalPort3001;

    if (internal2999 === 'ACCESSIBLE' && external3001 === 'FAILED') {
      this.results.portMapping.issue = 'MAPPING_MISMATCH';
      this.results.portMapping.description = 'Bot listens on 2999, Docker maps 3001:3001';
      this.results.portMapping.solution = 'Change Docker mapping to 3001:2999';
      this.results.recommendations.push('🔧 CRITICAL: Fix Docker port mapping from 3001:3001 to 3001:2999');
    } else if (internal2999 === 'FAILED') {
      this.results.portMapping.issue = 'APPLICATION_NOT_LISTENING';
      this.results.portMapping.description = 'Bot application not responding on port 2999';
      this.results.recommendations.push('🚨 Bot application not responding - check application health');
    } else if (external3001 === 'ACCESSIBLE') {
      this.results.portMapping.issue = 'NONE';
      this.results.portMapping.description = 'Port mapping working correctly';
    }
  }

  async validateAfterPortFix() {
    console.log('🔧 Validating system after port mapping fix...');

    await this.validateSingleBotSystem();

    const isFixed = this.results.networking.externalPort3001 === 'ACCESSIBLE' &&
                   this.results.networking.internalPort2999 === 'ACCESSIBLE';

    this.results.fixValidation = {
      timestamp: new Date().toISOString(),
      portMappingFixed: isFixed,
      externalAccessWorking: this.results.networking.externalPort3001 === 'ACCESSIBLE',
      internalApplicationHealthy: this.results.networking.internalPort2999 === 'ACCESSIBLE'
    };

    return isFixed;
  }

  async generateDockerFixCommand() {
    const fixCommand = `
# Docker Port Mapping Fix Commands
echo "🛑 Stopping current container..."
docker stop 999-multibots

echo "🗑️ Removing old container..."
docker rm 999-multibots

echo "🚀 Starting container with correct port mapping..."
docker run -d --name 999-multibots --restart=always \\
  -p 3001:2999 \\
  -v /root/999-agents-telegraf/.env:/app/.env:ro \\
  999-multibots

echo "✅ Container restarted with corrected port mapping"

# Verify fix
sleep 5
echo "🔍 Testing external access..."
curl -s http://localhost:3001/health && echo "✅ External access working" || echo "❌ External access failed"
`;

    this.results.dockerFixCommand = fixCommand.trim();
    return fixCommand.trim();
  }

  calculateOverallHealth() {
    let score = 100;

    if (this.results.containerHealth.status !== 'RUNNING') score -= 50;
    if (!this.results.applicationHealth.isRunning) score -= 30;
    if (this.results.networking.internalPort2999 !== 'ACCESSIBLE') score -= 20;
    if (this.results.networking.externalPort3001 !== 'ACCESSIBLE') score -= 20;

    score -= this.results.errors.length * 10;

    return Math.max(0, score);
  }

  extractUptime(containerStatus) {
    const uptimeMatch = containerStatus.match(/Up ([^,]+)/);
    return uptimeMatch ? uptimeMatch[1] : 'Unknown';
  }

  async saveResults() {
    const fs = require('fs').promises;
    const filename = `/Users/playra/999-agents-telegraf/tests/validation/single-bot-validation-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(this.results, null, 2));
    console.log(`📄 Single bot validation report saved: ${filename}`);
    return filename;
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 SINGLE BOT VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`🕐 Timestamp: ${this.results.timestamp}`);
    console.log(`📊 Overall Health: ${this.calculateOverallHealth()}%`);
    console.log(`🐳 Container Status: ${this.results.containerHealth.status || 'UNKNOWN'}`);
    console.log(`⚙️ Bot Process: ${this.results.applicationHealth.isRunning ? 'RUNNING' : 'STOPPED'}`);
    console.log(`🔌 Internal Port 2999: ${this.results.networking.internalPort2999 || 'UNKNOWN'}`);
    console.log(`🌐 External Port 3001: ${this.results.networking.externalPort3001 || 'UNKNOWN'}`);

    if (this.results.portMapping.issue) {
      console.log(`🚨 Port Mapping Issue: ${this.results.portMapping.issue}`);
      console.log(`📋 Description: ${this.results.portMapping.description}`);
    }

    if (this.results.recommendations.length > 0) {
      console.log('\n📋 RECOMMENDATIONS:');
      this.results.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    if (this.results.dockerFixCommand) {
      console.log('\n🔧 DOCKER FIX COMMAND:');
      console.log('```bash');
      console.log(this.results.dockerFixCommand);
      console.log('```');
    }

    console.log('='.repeat(60));
  }
}

// Export for use in other modules
module.exports = SingleBotValidator;

// CLI usage
if (require.main === module) {
  const validator = new SingleBotValidator();
  const command = process.argv[2];

  (async () => {
    try {
      switch (command) {
        case 'validate':
          await validator.validateSingleBotSystem();
          break;
        case 'after-fix':
          const fixed = await validator.validateAfterPortFix();
          console.log(fixed ? '✅ Port mapping fix SUCCESSFUL' : '❌ Port mapping fix FAILED');
          break;
        case 'fix-command':
          const fixCmd = await validator.generateDockerFixCommand();
          console.log(fixCmd);
          return;
        default:
          console.log('Usage: node single-bot-validator.js [validate|after-fix|fix-command]');
          await validator.validateSingleBotSystem();
      }

      validator.printSummary();
      await validator.saveResults();

    } catch (error) {
      console.error('💥 Single bot validation failed:', error);
      process.exit(1);
    }
  })();
}