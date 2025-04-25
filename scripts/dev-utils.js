/**
 * Утилиты для оптимизации процесса разработки
 * 
 * @module dev-utils
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

/**
 * Проверка занятости порта
 * @param {number} port - Порт для проверки
 * @returns {boolean} Занят ли порт
 */
export function isPortInUse(port) {
  try {
    let command;
    
    // Разные команды для разных ОС
    if (process.platform === 'win32') {
      command = `netstat -ano | findstr :${port}`;
    } else {
      command = `lsof -i:${port} -P -n | grep LISTEN`;
    }
    
    const result = execSync(command, { encoding: 'utf-8' });
    return result.trim().length > 0;
  } catch (error) {
    // Если команда не нашла процессов, порт свободен
    return false;
  }
}

/**
 * Освобождает порт, завершая процесс, который его использует
 * @param {number} port - Порт для освобождения
 * @returns {boolean} Успешно ли освобожден порт
 */
export function freePort(port) {
  try {
    let pid;
    
    // Получаем PID процесса, занимающего порт
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
      pid = result.trim().split(/\s+/).pop();
    } else {
      const result = execSync(`lsof -i:${port} -P -n -t`, { encoding: 'utf-8' });
      pid = result.trim();
    }
    
    if (pid) {
      // Завершаем процесс
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`);
      } else {
        execSync(`kill -9 ${pid}`);
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(chalk.red(`Не удалось освободить порт ${port}: ${error.message}`));
    return false;
  }
}

/**
 * Проверяет наличие всех необходимых зависимостей в package.json
 * @returns {boolean} Все ли зависимости установлены
 */
export function checkDependencies() {
  console.log(chalk.blue('🔍 Проверка зависимостей...'));
  
  const requiredDevDeps = [
    'vite',
    'dotenv',
    'chalk',
    'nodemon',
    'typescript',
    'tsx'
  ];
  
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.error(chalk.red('❌ Ошибка: файл package.json не найден'));
    return false;
  }
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const devDependencies = packageJson.devDependencies || {};
    const dependencies = packageJson.dependencies || {};
    
    const missing = [];
    
    for (const dep of requiredDevDeps) {
      if (!devDependencies[dep] && !dependencies[dep]) {
        missing.push(dep);
      }
    }
    
    if (missing.length > 0) {
      console.warn(
        chalk.yellow(`⚠️ Отсутствуют следующие зависимости: ${missing.join(', ')}`)
      );
      console.log(chalk.blue(`📦 Устанавливаем отсутствующие зависимости...`));
      
      execSync(`pnpm add -D ${missing.join(' ')}`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log(chalk.green('✅ Зависимости успешно установлены'));
    } else {
      console.log(chalk.green('✅ Все необходимые зависимости установлены'));
    }
    
    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Ошибка при проверке зависимостей: ${error.message}`));
    return false;
  }
}

/**
 * Проверяет наличие конфликтов с предыдущими запусками ботов
 * @returns {Object} Статус проверки и информация о конфликтах
 */
export function checkBotConflicts() {
  const lockFile = path.resolve(process.cwd(), '.bot-lock');
  
  if (fs.existsSync(lockFile)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
      const { pid, timestamp, botNames } = lockData;
      
      // Проверяем, существует ли процесс
      let processExists = false;
      
      try {
        if (process.platform === 'win32') {
          execSync(`tasklist /FI "PID eq ${pid}" | findstr ${pid}`);
          processExists = true;
        } else {
          execSync(`ps -p ${pid} -o pid=`);
          processExists = true;
        }
      } catch (error) {
        // Если команда вернула ошибку, то процесс не существует
        processExists = false;
      }
      
      if (processExists) {
        return {
          hasConflict: true,
          pid,
          timestamp,
          botNames,
          message: `Обнаружен активный экземпляр ботов (PID: ${pid}, запущен: ${new Date(timestamp).toLocaleString()})`
        };
      } else {
        // Процесс уже не существует, но файл остался
        fs.unlinkSync(lockFile);
        return { hasConflict: false };
      }
    } catch (error) {
      // Если файл поврежден или не читается, удаляем его
      try {
        fs.unlinkSync(lockFile);
      } catch (e) {
        // Игнорируем ошибки при удалении
      }
      
      return { hasConflict: false };
    }
  }
  
  return { hasConflict: false };
}

/**
 * Создает файл блокировки для предотвращения конфликтов
 * @param {Array<string>} botNames - Имена запущенных ботов
 */
export function createBotLock(botNames = []) {
  const lockFile = path.resolve(process.cwd(), '.bot-lock');
  
  const lockData = {
    pid: process.pid,
    timestamp: Date.now(),
    botNames
  };
  
  fs.writeFileSync(lockFile, JSON.stringify(lockData, null, 2), 'utf-8');
  console.log(chalk.green(`🔒 Создан файл блокировки для PID ${process.pid}`));
  
  // Создаем функцию для удаления блокировки при выходе
  const removeLock = () => {
    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log(chalk.blue(`🔓 Файл блокировки удален`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Ошибка при удалении файла блокировки: ${error.message}`));
    }
  };
  
  // Регистрируем обработчики событий для корректного удаления блокировки
  process.on('exit', removeLock);
  process.on('SIGINT', () => {
    removeLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    removeLock();
    process.exit(0);
  });
  process.on('uncaughtException', (error) => {
    console.error(chalk.red(`❌ Необработанное исключение: ${error.message}`));
    removeLock();
    process.exit(1);
  });
} 