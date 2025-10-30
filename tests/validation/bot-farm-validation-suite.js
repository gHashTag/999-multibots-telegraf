#!/usr/bin/env node

/**
 * Bot Farm Validation Suite
 * Comprehensive testing for 999-multibots Docker container
 * Part of the Solution Validation Testing framework
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class BotFarmValidator {
  constructor() {
    this.sshCommand = "ssh -i ~/.ssh/selectel root@185.161.67.53";
    this.results = {
      timestamp: new Date().toISOString(),
      containerHealth: {},
      botsStatus: {},
      networking: {},
      performance: {},
      errors: [],
      recommendations: []
    };
  }

  async validateContainerHealth() {
    console.log('🔍 Validating Docker container health...');

    try {
      // Check container status
      const { stdout: containerStatus } = await execAsync(`${this.sshCommand} 'docker ps | grep 999-multibots'`);
      this.results.containerHealth.status = containerStatus.includes('Up') ? 'RUNNING' : 'STOPPED';
      this.results.containerHealth.uptime = this.extractUptime(containerStatus);

      // Check container logs for errors
      const { stdout: logs } = await execAsync(`${this.sshCommand} 'docker logs 999-multibots --tail 50'`);
      this.results.containerHealth.hasErrors = logs.includes('ERROR') || logs.includes('error');
      this.results.containerHealth.hasWarnings = logs.includes('WARN') || logs.includes('warn');

      // Check container resources
      const { stdout: stats } = await execAsync(`${this.sshCommand} 'docker stats 999-multibots --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"'`);
      this.results.containerHealth.resourceUsage = this.parseStats(stats);

      console.log('✅ Container health validation complete');
    } catch (error) {
      this.results.errors.push(`Container health check failed: ${error.message}`);
      console.error('❌ Container health validation failed:', error.message);
    }
  }

  async validateNetworking() {
    console.log('🌐 Validating networking and ports...');

    try {
      // Test external port accessibility
      const { stdout: curlResult } = await execAsync(`${this.sshCommand} 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health || echo "CONNECTION_FAILED"'`);
      this.results.networking.externalPort = curlResult.trim() === '200' ? 'ACCESSIBLE' : 'FAILED';

      // Check internal ports
      const { stdout: ports } = await execAsync(`${this.sshCommand} 'docker exec 999-multibots netstat -tlnp | grep LISTEN'`);
      this.results.networking.internalPorts = this.parseActivePorts(ports);

      // Test bot endpoints individually
      for (let botPort = 2999; botPort <= 3008; botPort++) {
        try {
          const { stdout: botTest } = await execAsync(`${this.sshCommand} 'docker exec 999-multibots curl -s -o /dev/null -w "%{http_code}" http://localhost:${botPort}/health || echo "FAILED"'`);
          this.results.networking[`bot_${botPort}`] = botTest.trim() === '200' ? 'ACTIVE' : 'INACTIVE';
        } catch (error) {
          this.results.networking[`bot_${botPort}`] = 'ERROR';
        }
      }

      console.log('✅ Networking validation complete');
    } catch (error) {
      this.results.errors.push(`Networking validation failed: ${error.message}`);
      console.error('❌ Networking validation failed:', error.message);
    }
  }

  async validateBotsFunctionality() {
    console.log('🤖 Validating individual bots functionality...');

    try {
      // Check bot processes inside container
      const { stdout: processes } = await execAsync(`${this.sshCommand} 'docker exec 999-multibots ps aux | grep node'`);
      this.results.botsStatus.processCount = (processes.match(/node/g) || []).length;

      // Check bot configuration
      const { stdout: config } = await execAsync(`${this.sshCommand} 'docker exec 999-multibots ls -la /app/dist/handlers/ | wc -l'`);
      this.results.botsStatus.handlersCount = parseInt(config.trim()) - 1; // Subtract header line

      // Test bot responsiveness
      const botResponses = {};
      for (let i = 0; i < 10; i++) {
        try {
          const testStart = Date.now();
          await execAsync(`${this.sshCommand} 'timeout 5 docker exec 999-multibots curl -s http://localhost:${2999 + i}/health'`);
          botResponses[`bot_${i}`] = { status: 'RESPONSIVE', responseTime: Date.now() - testStart };
        } catch (error) {
          botResponses[`bot_${i}`] = { status: 'UNRESPONSIVE', error: error.message };
        }
      }
      this.results.botsStatus.individualResponses = botResponses;

      console.log('✅ Bots functionality validation complete');
    } catch (error) {
      this.results.errors.push(`Bots functionality validation failed: ${error.message}`);
      console.error('❌ Bots functionality validation failed:', error.message);
    }
  }

  async validateAfterFix(fixDescription) {
    console.log(`🔧 Validating system after fix: ${fixDescription}`);

    await this.runFullValidation();

    // Compare with pre-fix baseline if available
    this.results.fixValidation = {
      fixDescription,
      timestamp: new Date().toISOString(),
      healthImproved: this.results.errors.length === 0,
      activeBotsCount: Object.values(this.results.networking)
        .filter(status => status === 'ACTIVE').length
    };

    return this.results.fixValidation.healthImproved;
  }

  async runFullValidation() {
    console.log('🚀 Starting comprehensive bot farm validation...');

    await this.validateContainerHealth();
    await this.validateNetworking();
    await this.validateBotsFunctionality();

    this.generateRecommendations();
    this.results.validationComplete = true;
    this.results.overallHealth = this.calculateOverallHealth();

    console.log('✅ Full validation complete');
    return this.results;
  }

  generateRecommendations() {
    if (this.results.containerHealth.status !== 'RUNNING') {
      this.results.recommendations.push('🚨 CRITICAL: Container is not running - restart required');
    }

    if (this.results.networking.externalPort === 'FAILED') {
      this.results.recommendations.push('🔧 External port 3001 is not accessible - check Docker port mapping');
    }

    if (this.results.errors.length > 0) {
      this.results.recommendations.push('⚠️ Errors detected - review logs and apply fixes');
    }

    const activeBots = Object.values(this.results.networking)
      .filter(status => status === 'ACTIVE').length;

    if (activeBots < 10) {
      this.results.recommendations.push(`🤖 Only ${activeBots}/10 bots are active - investigate inactive bots`);
    }

    if (this.results.containerHealth.hasErrors) {
      this.results.recommendations.push('📋 Error logs detected - perform log analysis');
    }
  }

  calculateOverallHealth() {
    let score = 100;

    if (this.results.containerHealth.status !== 'RUNNING') score -= 50;
    if (this.results.networking.externalPort === 'FAILED') score -= 30;

    score -= this.results.errors.length * 10;

    const activeBots = Object.values(this.results.networking)
      .filter(status => status === 'ACTIVE').length;
    score -= (10 - activeBots) * 5;

    return Math.max(0, score);
  }

  extractUptime(containerStatus) {
    const uptimeMatch = containerStatus.match(/Up ([^,]+)/);
    return uptimeMatch ? uptimeMatch[1] : 'Unknown';
  }

  parseStats(stats) {
    const lines = stats.split('\n').filter(line => line.trim());
    if (lines.length < 2) return { cpu: 'N/A', memory: 'N/A', network: 'N/A' };

    const [cpu, memory, network] = lines[1].split('\t');
    return { cpu: cpu?.trim(), memory: memory?.trim(), network: network?.trim() };
  }

  parseActivePorts(ports) {
    return ports.split('\n')
      .filter(line => line.includes(':'))
      .map(line => {
        const portMatch = line.match(/:(\d+)/);
        return portMatch ? portMatch[1] : null;
      })
      .filter(Boolean);
  }

  async saveResults() {
    const fs = require('fs').promises;
    const filename = `/Users/playra/999-agents-telegraf/tests/validation/validation-report-${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(this.results, null, 2));
    console.log(`📄 Validation report saved: ${filename}`);
    return filename;
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 BOT FARM VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`🕐 Timestamp: ${this.results.timestamp}`);
    console.log(`📊 Overall Health: ${this.results.overallHealth}%`);
    console.log(`🐳 Container Status: ${this.results.containerHealth.status || 'UNKNOWN'}`);
    console.log(`🌐 External Access: ${this.results.networking.externalPort || 'UNKNOWN'}`);
    console.log(`🤖 Active Bots: ${Object.values(this.results.networking || {}).filter(s => s === 'ACTIVE').length}/10`);
    console.log(`❌ Errors Found: ${this.results.errors.length}`);
    console.log(`💡 Recommendations: ${this.results.recommendations.length}`);

    if (this.results.recommendations.length > 0) {
      console.log('\n📋 RECOMMENDATIONS:');
      this.results.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    if (this.results.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      this.results.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    console.log('='.repeat(60));
  }
}

// Export for use in other modules
module.exports = BotFarmValidator;

// CLI usage
if (require.main === module) {
  const validator = new BotFarmValidator();

  const command = process.argv[2];
  const description = process.argv[3];

  (async () => {
    try {
      let results;

      switch (command) {
        case 'full':
          results = await validator.runFullValidation();
          break;
        case 'after-fix':
          if (!description) {
            console.error('❌ Fix description required for after-fix validation');
            process.exit(1);
          }
          const improved = await validator.validateAfterFix(description);
          console.log(improved ? '✅ Fix validation PASSED' : '❌ Fix validation FAILED');
          break;
        case 'health':
          await validator.validateContainerHealth();
          break;
        case 'network':
          await validator.validateNetworking();
          break;
        case 'bots':
          await validator.validateBotsFunctionality();
          break;
        default:
          console.log('Usage: node bot-farm-validation-suite.js [full|after-fix|health|network|bots] [description]');
          process.exit(1);
      }

      validator.printSummary();
      await validator.saveResults();

      // Exit with appropriate code
      process.exit(validator.results.errors.length > 0 ? 1 : 0);

    } catch (error) {
      console.error('💥 Validation suite failed:', error);
      process.exit(1);
    }
  })();
}