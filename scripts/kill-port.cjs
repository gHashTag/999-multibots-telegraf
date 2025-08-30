#!/usr/bin/env node

/**
<<<<<<< HEAD
 * Kill processes running on specified ports
 * Usage: node scripts/kill-port.cjs <port1> <port2> ...
 */

const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

async function killPort(port) {
  try {
    // Find processes using the port
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(pid => pid);
    
    if (pids.length > 0) {
      console.log(`🔪 Killing processes on port ${port}: ${pids.join(', ')}`);
      
      // Kill the processes
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`✅ Killed process ${pid} on port ${port}`);
        } catch (error) {
          console.log(`⚠️ Process ${pid} may have already been terminated`);
        }
      }
    } else {
      console.log(`✅ Port ${port} is already free`);
    }
  } catch (error) {
    if (error.code === 1) {
      // lsof returns code 1 when no processes found - this is normal
      console.log(`✅ Port ${port} is already free`);
    } else {
      console.error(`❌ Error checking port ${port}:`, error.message);
    }
=======
 * Скрипт для очистки портов перед запуском ботов
 * Убивает процессы на указанных портах
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const ports = process.argv.slice(2);

if (ports.length === 0) {
  console.log('❌ Не указаны порты для очистки');
  process.exit(0);
}

console.log(`🧹 Cleaning up ports: ${ports.join(', ')}`);

async function killPort(port) {
  try {
    // Для macOS/Linux
    if (process.platform === 'darwin' || process.platform === 'linux') {
      await execAsync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`);
    } 
    // Для Windows
    else if (process.platform === 'win32') {
      await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);
      if (stdout) {
        const pid = stdout.trim().split(/\s+/).pop();
        await execAsync(`taskkill /F /PID ${pid}`);
      }
    }
    console.log(`✅ Port ${port} is already free`);
  } catch (error) {
    console.log(`✅ Port ${port} is already free`);
>>>>>>> main
  }
}

async function main() {
<<<<<<< HEAD
  const ports = process.argv.slice(2);
  
  if (ports.length === 0) {
    console.log('Usage: node scripts/kill-port.cjs <port1> <port2> ...');
    process.exit(1);
  }
  
  console.log(`🧹 Cleaning up ports: ${ports.join(', ')}`);
  
  // Kill ports in parallel
  await Promise.all(ports.map(port => killPort(port)));
  
  console.log('🎉 Port cleanup completed');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });
}
=======
  for (const port of ports) {
    await killPort(port);
  }
  console.log('🎉 Port cleanup completed');
}

main().catch(console.error);
>>>>>>> main
