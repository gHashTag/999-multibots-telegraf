#!/usr/bin/env node

/**
 * Production Logs Monitor & Auto-Fix Script
 * Monitors Docker container logs, detects issues, and triggers automatic fixes
 *
 * Usage: node scripts/logs-monitor.js [--tail N] [--no-fix] [--follow]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  server: 'root@212.86.115.30',
  sshKey: '~/.ssh/zomro',
  container: '999-multibots',
  projectPath: '/root/bot-farm',
  logLines: 100,
  autoFix: true,
  follow: false
};

// Parse command line arguments
process.argv.slice(2).forEach(arg => {
  if (arg.startsWith('--tail=')) {
    CONFIG.logLines = parseInt(arg.split('=')[1]) || 100;
  } else if (arg === '--no-fix') {
    CONFIG.autoFix = false;
  } else if (arg === '--follow' || arg === '-f') {
    CONFIG.follow = true;
  }
});

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(text) {
  log(`\n${'═'.repeat(60)}`, 'cyan');
  log(`  ${text}`, 'bright');
  log(`${'═'.repeat(60)}`, 'cyan');
}

function section(text) {
  log(`\n${text}`, 'blue');
  log(`${'-'.repeat(text.length)}`, 'blue');
}

function execSSH(command, options = {}) {
  const sshCmd = `ssh -i ${CONFIG.sshKey} ${CONFIG.server} '${command.replace(/'/g, "'\\''")}'`;
  try {
    const result = execSync(sshCmd, {
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });
    return options.silent ? result : null;
  } catch (error) {
    if (options.ignoreError) {
      return null;
    }
    log(`❌ SSH command failed: ${error.message}`, 'red');
    throw error;
  }
}

function getDockerStatus() {
  section('🐳 DOCKER CONTAINER STATUS');

  try {
    const status = execSSH(`docker ps -a | grep ${CONFIG.container}`, { silent: true, ignoreError: true });

    if (!status) {
      log('❌ Container not found!', 'red');
      return { running: false, exists: false };
    }

    const running = status.includes('Up');
    const uptime = running ? status.match(/Up ([^\s]+)/)?.[1] : 'N/A';

    log(`   Name: ${CONFIG.container}`, 'green');
    log(`   Status: ${running ? '🟢 RUNNING' : '🔴 STOPPED'}`, running ? 'green' : 'red');
    if (running) {
      log(`   Uptime: ${uptime}`, 'green');
    }

    return { running, exists: true, uptime };
  } catch (error) {
    log('❌ Failed to get Docker status', 'red');
    return { running: false, exists: false, error: error.message };
  }
}

function getResourceUsage() {
  section('💻 RESOURCE USAGE');

  try {
    const stats = execSSH(`docker stats ${CONFIG.container} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"`, { silent: true });

    if (!stats) {
      log('⚠️  Unable to get resource stats', 'yellow');
      return null;
    }

    const [cpu, mem, memPerc] = stats.trim().split('|');

    log(`   CPU: ${cpu}`, 'green');
    log(`   Memory: ${mem} (${memPerc})`, 'green');

    // Warnings
    const cpuNum = parseFloat(cpu);
    const memNum = parseFloat(memPerc);

    if (cpuNum > 80) {
      log(`   ⚠️  HIGH CPU USAGE!`, 'yellow');
    }
    if (memNum > 80) {
      log(`   ⚠️  HIGH MEMORY USAGE!`, 'yellow');
    }

    return { cpu, mem, memPerc };
  } catch (error) {
    log('⚠️  Failed to get resource usage', 'yellow');
    return null;
  }
}

function getContainerLogs() {
  section(`📝 CONTAINER LOGS (last ${CONFIG.logLines} lines)`);

  try {
    const logs = execSSH(`docker logs ${CONFIG.container} --tail ${CONFIG.logLines} 2>&1`, { silent: true });

    if (!logs) {
      log('⚠️  No logs available', 'yellow');
      return '';
    }

    // Print logs with color coding
    const lines = logs.split('\n');
    lines.forEach(line => {
      if (line.includes('Error') || line.includes('ERROR')) {
        log(line, 'red');
      } else if (line.includes('Warning') || line.includes('WARN')) {
        log(line, 'yellow');
      } else if (line.includes('Success') || line.includes('✓')) {
        log(line, 'green');
      } else {
        console.log(line);
      }
    });

    return logs;
  } catch (error) {
    log('❌ Failed to get logs', 'red');
    return '';
  }
}

function analyzeErrors(logs) {
  section('🔍 ERROR ANALYSIS');

  const errors = {
    javascript: [],
    telegram: [],
    database: [],
    network: [],
    other: []
  };

  const lines = logs.split('\n');

  // Pattern matching for different error types
  lines.forEach((line, index) => {
    // JavaScript errors
    if (line.match(/TypeError|ReferenceError|SyntaxError|RangeError/)) {
      errors.javascript.push({ line: index, text: line });
    }
    // Telegram API errors
    else if (line.match(/telegram|bot|api.*error/i)) {
      errors.telegram.push({ line: index, text: line });
    }
    // Database errors
    else if (line.match(/database|supabase|postgres|sql.*error/i)) {
      errors.database.push({ line: index, text: line });
    }
    // Network errors
    else if (line.match(/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network/i)) {
      errors.network.push({ line: index, text: line });
    }
    // Other errors
    else if (line.match(/error|exception|failed/i) && !line.match(/0 errors/i)) {
      errors.other.push({ line: index, text: line });
    }
  });

  let totalErrors = 0;

  if (errors.javascript.length > 0) {
    log(`   ❌ JavaScript Errors: ${errors.javascript.length}`, 'red');
    totalErrors += errors.javascript.length;
  }
  if (errors.telegram.length > 0) {
    log(`   ⚠️  Telegram API Issues: ${errors.telegram.length}`, 'yellow');
    totalErrors += errors.telegram.length;
  }
  if (errors.database.length > 0) {
    log(`   ⚠️  Database Issues: ${errors.database.length}`, 'yellow');
    totalErrors += errors.database.length;
  }
  if (errors.network.length > 0) {
    log(`   ⚠️  Network Issues: ${errors.network.length}`, 'yellow');
    totalErrors += errors.network.length;
  }
  if (errors.other.length > 0) {
    log(`   ⚠️  Other Issues: ${errors.other.length}`, 'yellow');
    totalErrors += errors.other.length;
  }

  if (totalErrors === 0) {
    log('   ✅ No critical errors detected!', 'green');
  }

  return errors;
}

function triggerAutoFix(errors) {
  if (!CONFIG.autoFix) {
    log('\n⏭️  Auto-fix disabled (use without --no-fix to enable)', 'yellow');
    return;
  }

  section('⚡ AUTOMATIC FIXES');

  // JavaScript errors - trigger js-error-fixer agent
  if (errors.javascript.length > 0) {
    log('   🤖 Triggering js-error-fixer agent...', 'cyan');

    // Save error context for agent
    const errorContext = {
      timestamp: new Date().toISOString(),
      errors: errors.javascript.slice(0, 5), // Limit to first 5 errors
      container: CONFIG.container,
      server: CONFIG.server
    };

    const contextPath = '/tmp/js-error-context.json';
    fs.writeFileSync(contextPath, JSON.stringify(errorContext, null, 2));

    log(`   📝 Error context saved to ${contextPath}`, 'green');
    log('   💡 To apply fixes, run: Task("js-error-fixer", "Fix production errors", "js-error-fixer")', 'cyan');
  }

  // Other error types - provide recommendations
  if (errors.telegram.length > 0) {
    log('\n   🔧 Telegram API Issues detected:', 'yellow');
    log('      • Check bot tokens in .env', 'yellow');
    log('      • Verify Telegram API status', 'yellow');
    log('      • Command: ssh -i ~/.ssh/zomro root@212.86.115.30 "cd /root/bot-farm && cat .env | grep BOT_TOKEN"', 'cyan');
  }

  if (errors.database.length > 0) {
    log('\n   🔧 Database Issues detected:', 'yellow');
    log('      • Check Supabase connection', 'yellow');
    log('      • Verify DATABASE_URL in .env', 'yellow');
    log('      • Check Supabase dashboard for outages', 'yellow');
  }

  if (errors.network.length > 0) {
    log('\n   🔧 Network Issues detected:', 'yellow');
    log('      • Check server connectivity', 'yellow');
    log('      • Verify external API endpoints', 'yellow');
    log('      • Command: ssh -i ~/.ssh/zomro root@212.86.115.30 "ping -c 3 api.telegram.org"', 'cyan');
  }
}

function generateQuickFixCommands(dockerStatus, errors) {
  section('🛠️  QUICK FIX COMMANDS');

  // Container not running
  if (!dockerStatus.running && dockerStatus.exists) {
    log('\n   Container stopped - Restart:', 'yellow');
    log(`   ssh -i ~/.ssh/zomro root@212.86.115.30 'docker start ${CONFIG.container}'`, 'cyan');
  }

  // High error count - suggest rebuild
  const totalErrors = Object.values(errors).reduce((sum, arr) => sum + arr.length, 0);
  if (totalErrors > 10) {
    log('\n   High error count - Full rebuild:', 'yellow');
    log(`   /deploy`, 'cyan');
  }

  // View live logs
  log('\n   Follow logs in real-time:', 'green');
  log(`   ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs -f ${CONFIG.container}'`, 'cyan');

  // Check processes
  log('\n   Check running processes:', 'green');
  log(`   ssh -i ~/.ssh/zomro root@212.86.115.30 'docker exec ${CONFIG.container} ps aux'`, 'cyan');
}

async function main() {
  try {
    header('📊 PRODUCTION LOGS MONITOR - 999-multibots');

    log(`\n🔍 Analyzing production server: ${CONFIG.server}`, 'bright');
    log(`📦 Container: ${CONFIG.container}`, 'bright');
    log(`⚙️  Auto-fix: ${CONFIG.autoFix ? 'ENABLED' : 'DISABLED'}`, CONFIG.autoFix ? 'green' : 'yellow');

    // 1. Check Docker status
    const dockerStatus = getDockerStatus();

    if (!dockerStatus.exists) {
      log('\n❌ Container does not exist! Please check configuration.', 'red');
      process.exit(1);
    }

    if (!dockerStatus.running) {
      log('\n⚠️  Container is not running!', 'yellow');
      log('   Start with: /deploy or docker start command', 'cyan');
      process.exit(0);
    }

    // 2. Get resource usage
    getResourceUsage();

    // 3. Get and display logs
    const logs = getContainerLogs();

    // 4. Analyze errors
    const errors = analyzeErrors(logs);

    // 5. Trigger auto-fixes
    triggerAutoFix(errors);

    // 6. Generate quick fix commands
    generateQuickFixCommands(dockerStatus, errors);

    log('\n✅ Log analysis complete!', 'green');

    // Follow mode
    if (CONFIG.follow) {
      log('\n👀 Entering follow mode (Ctrl+C to exit)...', 'cyan');
      execSSH(`docker logs -f ${CONFIG.container}`, { silent: false });
    }

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run
main();
