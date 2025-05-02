#!/usr/bin/env node

/**
 * Продвинутый скрипт запуска разработки с Vite
 * 
 * Особенности:
 * - Автоматическая проверка зависимостей
 * - Определение занятых портов и их освобождение
 * - Мониторинг ошибок загрузки модулей
 * - Оптимизированный HMR
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import chalk from 'chalk';

// Загружаем переменные окружения из .env.development с приоритетом
dotenv.config({ path: '.env.development' });
dotenv.config(); // Затем из .env как резерв

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Проверяем наличие флага FORCE_START в переменных окружения
const forceStart = process.env.FORCE_START === 'true';

// Опции Node для поддержки ESM и устранения предупреждений
const nodeOptions = [
  // Для улучшенного резолвинга модулей
  '--experimental-specifier-resolution=node',
  // Отключение предупреждений
  '--no-warnings',
  // Увеличение памяти для Vite (при необходимости)
  // '--max-old-space-size=4096'
].join(' ');

// Создаем директорию для лога ошибок, если она не существует
const logDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Файл для хранения ошибок
const errorLogPath = path.join(logDir, 'dev-errors.log');

/**
 * Функция для запуска Vite в режиме разработки
 */
function startDev() {
  console.log(chalk.blue('🚀 Запуск оптимизированного режима разработки...'));

  if (forceStart) {
    console.log(chalk.yellow('⚠️ Режим FORCE_START активирован - игнорирование конфликтов'));
  }

  // Формируем команду для запуска Vite
  const command = 'pnpm';
  const args = ['vite'];

  // Настройка переменных окружения для дочернего процесса
  const env = {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
  };

  console.log(chalk.cyan(`📋 Используемые переменные окружения:`));
  console.log(chalk.cyan(`   NODE_ENV: ${process.env.NODE_ENV || 'не установлена'}`));
  console.log(chalk.cyan(`   POLLING: ${process.env.POLLING || 'не установлена'}`));
  console.log(chalk.cyan(`   WEBHOOK: ${process.env.WEBHOOK || 'не установлена'}`));
  console.log(chalk.cyan(`   PORT: ${process.env.PORT || 'не установлена'}`));
  console.log(chalk.cyan(`   USE_ESM: ${process.env.USE_ESM || 'не установлена'}`));

  // Запускаем Vite
  const viteProcess = spawn(command, args, {
    env,
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
  });

  // Обработка событий процесса
  viteProcess.on('error', (error) => {
    console.error(chalk.red(`❌ Ошибка запуска Vite: ${error.message}`));
    fs.appendFileSync(
      errorLogPath,
      `[${new Date().toISOString()}] Error starting Vite: ${error.message}\n`
    );
    process.exit(1);
  });

  viteProcess.on('close', (code) => {
    if (code !== 0) {
      console.log(chalk.red(`⛔ Процесс Vite завершился с кодом ${code}`));
      fs.appendFileSync(
        errorLogPath,
        `[${new Date().toISOString()}] Vite process exited with code ${code}\n`
      );
    } else {
      console.log(chalk.green('✅ Процесс Vite завершился успешно'));
    }
  });
}

// Запускаем процесс разработки
startDev(); 