#!/usr/bin/env node

/**
 * Скрипт для исправления импортов ModeEnum, когда он используется как значение
 * Находит файлы, где ModeEnum импортируется как тип, но используется как значение
 * и исправляет импорты.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Создаем каталог для резервных копий
const timestamp = new Date().toISOString()
  .replace(/[:.]/g, '')
  .split('T')[0] + '_' + 
  new Date().toISOString().replace(/[:.]/g, '').split('T')[1].slice(0, 6);
const backupDir = path.join(rootDir, `backup_mode_enum_${timestamp}`);

// Сначала сделаем резервную копию директории src
function createBackup() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Копируем src каталог
  const srcBackupDir = path.join(backupDir, 'src');
  if (!fs.existsSync(srcBackupDir)) {
    fs.mkdirSync(srcBackupDir, { recursive: true });
  }
  
  const allFiles = globSync(path.join(rootDir, 'src/**/*.ts'));
  for (const file of allFiles) {
    const relativePath = path.relative(path.join(rootDir, 'src'), file);
    const destPath = path.join(srcBackupDir, relativePath);
    const destDir = path.dirname(destPath);
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(file, destPath);
  }
  
  console.log(`📦 Создана резервная копия src в ${backupDir}`);
}

function fixImports() {
  const files = globSync(path.join(rootDir, 'src/**/*.ts'));
  let fixedFiles = 0;
  let skippedFiles = 0;
  
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    
    // Проверяем, импортируется ли ModeEnum как тип
    const hasTypeImport = content.includes('import type') && 
      /import\s+type\s+\{[^}]*ModeEnum[^}]*\}\s+from/.test(content);
    
    // Проверяем, используется ли ModeEnum как значение (например, ModeEnum.SomeValue)
    const usesAsValue = /ModeEnum\.\w+/.test(content);
    
    if (hasTypeImport && usesAsValue) {
      console.log(`🔧 Исправляю файл: ${path.relative(rootDir, file)}`);
      
      // Если есть import type с ModeEnum, заменим его на обычный import
      content = content.replace(
        /import\s+type\s+\{([^}]*ModeEnum[^}]*)\}\s+from\s+(['"])([^'"]+)\2/g,
        (match, imports, quote, source) => {
          // Разбиваем импортируемые типы на массив и удаляем пробелы
          const importsList = imports.split(',').map(i => i.trim());
          // Находим индекс ModeEnum
          const modeEnumIndex = importsList.findIndex(i => i === 'ModeEnum');
          
          if (modeEnumIndex !== -1) {
            // Удаляем ModeEnum из списка импортов типов
            importsList.splice(modeEnumIndex, 1);
            
            let result = '';
            
            // Если остались другие типы, сохраняем импорт типов
            if (importsList.length > 0) {
              result += `import type { ${importsList.join(', ')} } from ${quote}${source}${quote};\n`;
            }
            
            // Добавляем обычный импорт для ModeEnum
            result += `import { ModeEnum } from ${quote}${source}${quote};`;
            
            return result;
          }
          
          return match;
        }
      );
      
      // Если содержимое изменилось, записываем изменения
      if (content !== originalContent) {
        fs.writeFileSync(file, content);
        fixedFiles++;
        console.log(`✅ Исправлен: ${path.relative(rootDir, file)}`);
      } else {
        console.log(`⚠️ Не удалось исправить: ${path.relative(rootDir, file)}`);
        skippedFiles++;
      }
    }
  }
  
  return { fixedFiles, skippedFiles, totalFiles: files.length };
}

// Основная функция
async function main() {
  console.log('🔍 Запуск фиксации импортов ModeEnum...');
  
  // Создаем резервную копию
  createBackup();
  
  // Исправляем импорты
  const { fixedFiles, skippedFiles, totalFiles } = fixImports();
  
  console.log('\n📊 Результаты:');
  console.log(`- Всего проверено файлов: ${totalFiles}`);
  console.log(`- Исправлено файлов: ${fixedFiles}`);
  console.log(`- Не удалось исправить: ${skippedFiles}`);
  console.log(`- Резервная копия сохранена в: ${backupDir}`);
  
  if (fixedFiles > 0) {
    console.log('\n⭐ Исправления внесены! Выполните "pnpm typecheck" для проверки результатов.');
  } else {
    console.log('\n📝 Файлы, требующие исправления, не найдены.');
  }
}

main().catch(error => {
  console.error('❌ Ошибка:', error);
  process.exit(1);
}); 