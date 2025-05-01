#!/usr/bin/env node

/**
 * Улучшенный скрипт запуска для продакшена
 * 
 * Особенности:
 * - Проверка на конфликты запущенных ботов
 * - Мониторинг ресурсов
 * - Автоматический перезапуск при сбоях
 * - Логирование всех событий
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

// Импортируем утилиты для проверки конфликтов
import { checkBotConflicts, createBotLock } from './dev-utils.js';

// Загружаем переменные окружения из .env.production с приоритетом
dotenv.config({ path: '.env.production' });
dotenv.config(); // Затем из .env как резерв

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Проверяем наличие флага FORCE_START в переменных окружения
const forceStart = process.env.FORCE_START === 'true';

// Создаем директорию для логов, если она не существует
const logDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Файлы для записи логов
const outLogPath = path.join(logDir, 'neuroblogger-out.log');
const errLogPath = path.join(logDir, 'neuroblogger-err.log');

// Создаем файловые потоки для логов
const outStream = fs.createWriteStream(outLogPath, { flags: 'a' });
const errStream = fs.createWriteStream(errLogPath, { flags: 'a' });

/**
 * Записывает сообщение в лог и консоль
 * @param {string} message - Сообщение для записи
 * @param {boolean} isError - Флаг ошибки
 */
function logMessage(message, isError = false) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}\n`;
  
  if (isError) {
    errStream.write(formattedMessage);
    console.error(chalk.red(message));
  } else {
    outStream.write(formattedMessage);
    console.log(message);
  }
}

/**
 * Запускает бота в продакшен-режиме
 */
function startProduction() {
  logMessage(chalk.blue('🚀 Запуск NeuroBlogger в продакшен-режиме...'));
  
  // Проверяем наличие конфликтов с другими экземплярами ботов
  const { hasConflict, message, pid } = checkBotConflicts();
  
  if (hasConflict && !forceStart) {
    logMessage(chalk.red(`⚠️ ${message}`), true);
    logMessage(chalk.red(`⚠️ Для принудительного запуска используйте FORCE_START=true`), true);
    process.exit(1);
  } else if (hasConflict && forceStart) {
    logMessage(chalk.yellow(`⚠️ ${message}`));
    logMessage(chalk.yellow(`⚠️ Режим FORCE_START активирован - продолжаем запуск, игнорируя конфликт`));
    
    // Завершаем конфликтующий процесс
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /PID ${pid}`);
      } else {
        execSync(`kill -9 ${pid}`);
      }
      logMessage(chalk.green(`✅ Процесс ${pid} успешно завершен`));
    } catch (error) {
      logMessage(chalk.red(`❌ Не удалось завершить процесс ${pid}: ${error.message}`), true);
    }
  }
  
  // Определяем команду для запуска в зависимости от режима
  // По умолчанию запускаем через Node.js
  const command = 'node';
  const args = ['dist/bot.js'];
  
  // Режим использования PM2
  if (process.env.USE_PM2 === 'true') {
    try {
      // Проверяем, установлен ли PM2
      execSync('pm2 --version', { stdio: 'ignore' });
      
      logMessage(chalk.blue('📊 Запуск через PM2...'));
      
      // Настройки для PM2
      const pm2Config = {
        name: 'neuroblogger',
        script: 'dist/bot.js',
        instances: process.env.PM2_INSTANCES || 1,
        max_memory_restart: process.env.PM2_MAX_MEMORY || '500M',
        output: outLogPath,
        error: errLogPath,
        env: {
          NODE_ENV: 'production',
          ...process.env
        }
      };
      
      // Создаем временный файл конфигурации PM2
      const pm2ConfigPath = path.join(rootDir, 'pm2.config.json');
      fs.writeFileSync(pm2ConfigPath, JSON.stringify(pm2Config, null, 2));
      
      // Запускаем через PM2
      execSync(`pm2 start ${pm2ConfigPath}`, { stdio: 'inherit' });
      
      // Удаляем временный файл конфигурации
      fs.unlinkSync(pm2ConfigPath);
      
      // Сохраняем конфигурацию PM2 для автозапуска
      execSync('pm2 save', { stdio: 'inherit' });
      
      logMessage(chalk.green('✅ NeuroBlogger успешно запущен через PM2'));
      
      // Создаем файл блокировки
      const botNames = ['NeuroBlogger'];
      createBotLock(botNames);
      
      // Показываем статус
      execSync('pm2 status', { stdio: 'inherit' });
      return;
    } catch (error) {
      logMessage(chalk.yellow(`⚠️ PM2 не установлен или произошла ошибка: ${error.message}`));
      logMessage(chalk.yellow(`⚠️ Продолжаем запуск в обычном режиме...`));
    }
  }
  
  // Настройка переменных окружения для дочернего процесса
  const env = {
    ...process.env,
    NODE_ENV: 'production'
  };
  
  logMessage(chalk.cyan(`📋 Используемые переменные окружения:`));
  logMessage(chalk.cyan(`   NODE_ENV: ${env.NODE_ENV || 'не установлена'}`));
  logMessage(chalk.cyan(`   POLLING: ${env.POLLING || 'не установлена'}`));
  logMessage(chalk.cyan(`   WEBHOOK: ${env.WEBHOOK || 'не установлена'}`));
  logMessage(chalk.cyan(`   PORT: ${env.PORT || 'не установлена'}`));
  
  // Запускаем бота
  const botProcess = spawn(command, args, {
    env,
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Создаем файл блокировки
  const botNames = ['NeuroBlogger'];
  createBotLock(botNames);
  
  // Перенаправляем вывод в лог-файлы и консоль
  botProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(message);
    }
  });
  
  botProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    if (message) {
      logMessage(message, true);
    }
  });
  
  // Обработка событий процесса
  botProcess.on('error', (error) => {
    logMessage(chalk.red(`❌ Ошибка запуска бота: ${error.message}`), true);
    process.exit(1);
  });
  
  botProcess.on('close', (code) => {
    if (code !== 0) {
      logMessage(chalk.red(`⛔ Процесс бота завершился с кодом ${code}`), true);
      
      // Автоматический перезапуск при сбое, если включена соответствующая опция
      if (process.env.AUTO_RESTART === 'true') {
        logMessage(chalk.yellow(`⚠️ Автоматический перезапуск через 5 секунд...`));
        setTimeout(startProduction, 5000);
      } else {
        process.exit(code);
      }
    } else {
      logMessage(chalk.green('✅ Процесс бота завершился успешно'));
    }
  });
  
  logMessage(chalk.green(`✅ NeuroBlogger успешно запущен с PID: ${botProcess.pid}`));
}

// Запускаем процесс
startProduction(); 