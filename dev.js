#!/usr/bin/env node

/**
 * Unified Development Server Startup Script
 * Runs both main server and Inngest Dev UI simultaneously
 */

const { spawn } = require('child_process');
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║  🚀 VIBEE DEVELOPMENT SERVER - UNIFIED STARTUP           ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}\n`);

const processes = [];

// Function to spawn a process with colored output
function spawnProcess(name, command, args, color) {
  const proc = spawn(command, args, {
    shell: true,
    stdio: 'inherit'
  });

  proc.on('spawn', () => {
    console.log(`${colors.bright}${color}[${name}]${colors.reset} ${colors.bright}Started successfully${colors.reset}\n`);
  });

  proc.on('exit', (code, signal) => {
    console.log(`${colors.bright}${color}[${name}]${colors.reset} ${colors.red}Process exited with code ${code}${colors.reset}\n`);

    // Kill all other processes on exit
    processes.forEach(p => {
      if (p.proc !== proc) {
        p.proc.kill();
      }
    });

    process.exit(code || 0);
  });

  proc.on('error', (err) => {
    console.error(`${colors.bright}${color}[${name}]${colors.reset} ${colors.red}Failed to start: ${err.message}${colors.reset}\n`);
  });

  processes.push({ name, proc, color });
  return proc;
}

// Cleanup function
function cleanup() {
  console.log(`\n${colors.yellow}${colors.bright}Shutting down development servers...${colors.reset}\n`);
  processes.forEach(({ proc }) => {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  });
  setTimeout(() => {
    processes.forEach(({ proc }) => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    });
    process.exit(0);
  }, 2000);
}

// Handle Ctrl+C
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

try {
  // Start main development server
  console.log(`${colors.green}🔄 Starting main development server...${colors.reset}`);
  spawnProcess(
    'SERVER',
    'bun',
    ['--watch', 'src/index.ts'],
    colors.green
  );

  // Wait a bit for server to start, then start Inngest
  setTimeout(() => {
    console.log(`${colors.cyan}🔄 Starting Inngest Dev UI...${colors.reset}`);
    spawnProcess(
      'INNGEST',
      'npx',
      ['inngest-cli@latest', 'dev', '-u', 'http://localhost:3000/api/inngest', '--port', '8288'],
      colors.cyan
    );
  }, 3000);

  console.log(`${colors.bright}${colors.yellow}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${colors.reset}Both services are starting up...
${colors.bright}${colors.green}  • SERVER  - Main development server on port 3000${colors.reset}
${colors.bright}${colors.cyan}  • INNGEST - Inngest Dev UI on port 8288${colors.reset}
${colors.bright}${colors.yellow}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${colors.reset}`);

} catch (error) {
  console.error(`${colors.red}${colors.bright}Failed to start development environment:${colors.reset}\n`, error);
  process.exit(1);
}

// Keep the process alive
process.on('exit', (code) => {
  console.log(`${colors.yellow}Development environment stopped (exit code: ${code})${colors.reset}\n`);
});
