#!/usr/bin/env node

/**
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
  }
}

async function main() {
  for (const port of ports) {
    await killPort(port);
  }
  console.log('🎉 Port cleanup completed');
}

main().catch(console.error);