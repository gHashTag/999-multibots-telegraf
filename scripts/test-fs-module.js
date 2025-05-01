#!/usr/bin/env node

/**
 * Скрипт для тестирования импорта модулей Node.js через Vite
 * Этот скрипт помогает диагностировать проблемы с импортом встроенных модулей Node.js
 * при использовании ESM и TypeScript
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Получаем текущую директорию скрипта
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Настройка переменных окружения
const env = {
  ...process.env,
  NODE_OPTIONS: '--experimental-specifier-resolution=node --no-warnings',
  USE_ESM: 'true',
  DEBUG: 'vite:*',
};

console.log('🧪 Запуск теста модулей Node.js через Vite...');
console.log('📂 Тестируемый файл: src/test-modules.ts');

// Используем vite-node для запуска TypeScript напрямую
const command = 'npx';
const args = ['vite-node', 'src/test-modules.ts'];

// Создаем процесс
const testProcess = spawn(command, args, {
  cwd: rootDir,
  env,
  stdio: 'inherit',
  shell: true,
});

// Обработка событий процесса
testProcess.on('error', (error) => {
  console.error(`❌ Ошибка запуска процесса: ${error.message}`);
  process.exit(1);
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('✅ Тест выполнен успешно!');
  } else {
    console.error(`❌ Процесс завершился с кодом ошибки: ${code}`);
    process.exit(code || 1);
  }
}); 