#!/usr/bin/env node

/**
 * Скрипт для автоматического исправления импортов типов
 * 
 * Проблема: Некоторые импорты с директивой 'type' используются как значения,
 * что вызывает ошибку TS1361: X cannot be used as a value because it was imported using 'import type'.
 * 
 * Решение: Этот скрипт ищет и исправляет импорты, удаляя директиву 'type' для импортов,
 * которые используются как в типах, так и в значениях.
 */

import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Список имен, которые часто импортируются с 'type', но используются как значения
const commonValueImports = [
  'Scenes',
  'Markup',
  'SubscriptionType',
  'PaymentType',
  'ModeEnum',
  'ModelType'
];

// Создаем резервную копию директории src перед внесением изменений
function backupDirectory(dir) {
  const date = new Date();
  const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
  const backupDir = `backup_${dir}_type_imports_${timestamp}`;
  
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
  
  let fixedImportsCount = 0;
  let fixedFilesCount = 0;
  
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;
    
    // Ищем импорты с 'type', которые используются как значения
    for (const importName of commonValueImports) {
      // Регулярное выражение для поиска импорта с 'type'
      const typeImportRegex = new RegExp(`import\\s+type\\s*{[^}]*\\b${importName}\\b[^}]*}\\s+from\\s+['"][^'"]+['"]`, 'g');
      
      // Если найден импорт с 'type', заменяем на обычный импорт
      if (typeImportRegex.test(content)) {
        content = content.replace(typeImportRegex, (match) => {
          return match.replace('import type', 'import');
        });
        fixedImportsCount++;
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
  console.log(`- Исправлено импортов: ${fixedImportsCount}`);
  console.log(`- Исправлено файлов: ${fixedFilesCount}`);
  
  return { fixedImportsCount, fixedFilesCount };
}

// Основная функция
async function main() {
  console.log('🔧 Запуск исправления импортов типов...');
  
  // Создаем резервные копии
  const srcBackup = backupDirectory('src');
  const testsBackup = backupDirectory('__tests__');
  
  console.log(`✅ Созданы резервные копии директорий: ${srcBackup} и ${testsBackup}`);
  
  // Обрабатываем директории
  const srcStats = processDirectory('src');
  const testsStats = processDirectory('__tests__');
  
  const totalFixedImports = srcStats.fixedImportsCount + testsStats.fixedImportsCount;
  const totalFixedFiles = srcStats.fixedFilesCount + testsStats.fixedFilesCount;
  
  console.log('\n📊 Общие результаты:');
  console.log(`- Всего исправлено импортов: ${totalFixedImports}`);
  console.log(`- Всего исправлено файлов: ${totalFixedFiles}`);
  console.log(`- Резервные копии сохранены в: ${srcBackup} и ${testsBackup}`);
  
  console.log('\n✨ Исправление импортов типов завершено!');
  console.log('🔍 Рекомендуется запустить проверку типов: pnpm typecheck');
}

main().catch(error => {
  console.error('❌ Произошла ошибка:', error);
  process.exit(1);
});
