#!/usr/bin/env node

/**
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
  }
}

async function main() {
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