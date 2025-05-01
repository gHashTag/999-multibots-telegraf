#!/usr/bin/env node

/**
 * Скрипт для исправления оставшихся проблем с типами
 * 
 * Проблема: 
 * 1. Некоторые типы импортируются с обычным import, но нужно использовать import type
 * 2. Некоторые значения, импортированные с import type, нужно импортировать обычным способом
 * 
 * Решение: Этот скрипт обрабатывает эти случаи
 */

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Типы, которые должны импортироваться с import type
const typeOnlyImports = [
  'TelegramId',
  'BalanceOperationResult',
  'CostDetails',
  'CostCalculationParams',
  'CostCalculationResult',
  'PaymentCreateParams',
  'PaymentProcessResult',
  'Subscription',
  'Mode',
  'NarrowedContext'
];

// Значения, которые должны импортироваться без import type
const valueImports = [
  'normalizeTelegramId',
  'PaymentStatus',
  'Currency',
  'getUserByTelegramIdString',
  'determineSubscriptionType',
  'getBotNameByToken',
  'DEFAULT_BOT_NAME'
];

// Создаем резервную копию директории src перед внесением изменений
function backupDirectory(dir) {
  const date = new Date();
  const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
  const backupDir = `backup_${dir}_remaining_types_${timestamp}`;
  
  console.log(`Создание резервной копии директории ${dir} в ${backupDir}...`);
  
  // Рекурсивное копирование директории
  copyDirRecursiveSync(`./${dir}`, `./${backupDir}`);
  
  return backupDir;
}

// Функция для рекурсивного копирования директории
function copyDirRecursiveSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Обрабатываем файлы в указанной директории
function processDirectory(directory) {
  console.log(`Обработка файлов в директории ${directory}...`);
  
  // Ищем все TypeScript файлы
  const files = globSync(`${directory}/**/*.ts`);
  console.log(`Найдено ${files.length} файлов для обработки.`);
  
  let fixedTypeOnlyImportsCount = 0;
  let fixedValueImportsCount = 0;
  let fixedFilesCount = 0;
  
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;
    
    // Преобразуем обычные импорты типов в import type
    for (const typeName of typeOnlyImports) {
      // Регулярное выражение для поиска импорта без 'type'
      const normalImportRegex = new RegExp(`import\\s*{[^}]*\\b${typeName}\\b[^}]*}\\s+from\\s+['"][^'"]+['"]`, 'g');
      
      // Если найден импорт без 'type', заменяем на import type
      if (normalImportRegex.test(content)) {
        content = content.replace(normalImportRegex, (match) => {
          if (!match.includes('import type')) {
            return match.replace('import', 'import type');
          }
          return match;
        });
        fixedTypeOnlyImportsCount++;
      }
    }
    
    // Преобразуем import type для значений в обычный import
    for (const valueName of valueImports) {
      // Регулярное выражение для поиска импорта с 'type'
      const typeImportRegex = new RegExp(`import\\s+type\\s*{[^}]*\\b${valueName}\\b[^}]*}\\s+from\\s+['"][^'"]+['"]`, 'g');
      
      // Если найден импорт с 'type', заменяем на обычный import
      if (typeImportRegex.test(content)) {
        content = content.replace(typeImportRegex, (match) => {
          return match.replace('import type', 'import');
        });
        fixedValueImportsCount++;
      }
    }
    
    // Если содержимое файла изменилось, сохраняем его
    if (content !== originalContent) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`✅ Исправлены импорты в файле: ${file}`);
      fixedFilesCount++;
    }
  }
  
  console.log(`Итоги обработки директории ${directory}:`);
  console.log(`- Преобразовано в 'import type': ${fixedTypeOnlyImportsCount}`);
  console.log(`- Преобразовано в обычный import: ${fixedValueImportsCount}`);
  console.log(`- Исправлено файлов: ${fixedFilesCount}`);
  
  return { fixedTypeOnlyImportsCount, fixedValueImportsCount, fixedFilesCount };
}

// Основная функция
async function main() {
  console.log('🔧 Запуск исправления оставшихся проблем с типами...');
  
  // Создаем резервные копии
  const srcBackup = backupDirectory('src');
  const testsBackup = backupDirectory('__tests__');
  
  console.log(`✅ Созданы резервные копии директорий: ${srcBackup} и ${testsBackup}`);
  
  // Обрабатываем директории
  const srcStats = processDirectory('src');
  const testsStats = processDirectory('__tests__');
  
  const totalFixedTypeOnlyImports = srcStats.fixedTypeOnlyImportsCount + testsStats.fixedTypeOnlyImportsCount;
  const totalFixedValueImports = srcStats.fixedValueImportsCount + testsStats.fixedValueImportsCount;
  const totalFixedFiles = srcStats.fixedFilesCount + testsStats.fixedFilesCount;
  
  console.log('\n📊 Общие результаты:');
  console.log(`- Всего преобразовано в 'import type': ${totalFixedTypeOnlyImports}`);
  console.log(`- Всего преобразовано в обычный import: ${totalFixedValueImports}`);
  console.log(`- Всего исправлено файлов: ${totalFixedFiles}`);
  console.log(`- Резервные копии сохранены в: ${srcBackup} и ${testsBackup}`);
  
  console.log('\n✨ Исправление типов завершено!');
  console.log('🔍 Рекомендуется запустить проверку типов: pnpm typecheck');
}

main().catch(error => {
  console.error('❌ Произошла ошибка:', error);
  process.exit(1);
}); 