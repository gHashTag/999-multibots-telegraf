/**
 * Этот скрипт находит и исправляет все импорты enum ModeEnum, которые были 
 * преобразованы в import type, но используются как значение в коде.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем каталог для резервных копий
const backupDir = `backup_src_enum_imports_${new Date().toISOString().replace(/[:.]/g, '').split('T')[0]}_${new Date().toISOString().replace(/[:.]/g, '').split('T')[1].slice(0, 6)}`;

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

function createBackup(sourcePath, backupFolder) {
  const relativePath = path.relative(process.cwd(), sourcePath);
  const backupPath = path.join(backupFolder, relativePath);
  const backupDir = path.dirname(backupPath);
  
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  fs.copyFileSync(sourcePath, backupPath);
  console.log(`📦 Создана резервная копия: ${backupPath}`);
}

// Обрабатываем файлы в директории src
const processFiles = (pattern) => {
  const files = globSync(pattern);
  let fixedFilesCount = 0;
  let fixedImportsCount = 0;

  files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;

    // Проверяем, есть ли импорт типа ModeEnum
    const hasTypeImport = /import\s+type\s+\{\s*(?:.*,\s*)?ModeEnum(?:\s*,\s*.*?)?\s*\}\s+from\s+(['"])@\/interfaces\/modes\1/.test(content);
    
    // Проверяем, есть ли использование ModeEnum как значения
    const usesAsValue = /ModeEnum\.\w+/.test(content);
    
    if (hasTypeImport && usesAsValue) {
      // Создаем резервную копию перед изменением
      createBackup(file, backupDir);
      
      // Заменяем импорт типа на обычный импорт
      content = content.replace(
        /import\s+type\s+\{\s*(?:(.*),\s*)?ModeEnum(?:\s*,\s*(.*?))?\s*\}\s+from\s+(['"])@\/interfaces\/modes\3/g,
        (match, before, after, quote) => {
          let replacement = '';
          
          // Если есть другие типы в импорте, сохраняем их в import type
          const otherTypes = [before, after].filter(Boolean).join(', ');
          if (otherTypes) {
            replacement += `import type { ${otherTypes} } from ${quote}@/interfaces/modes${quote};\n`;
          }
          
          // Добавляем отдельный импорт для ModeEnum
          replacement += `import { ModeEnum } from ${quote}@/interfaces/modes${quote};`;
          return replacement;
        }
      );
      
      // Если у нас уже есть обычный импорт ModeEnum, не добавляем дублирующий
      if (content !== originalContent) {
        fixedFilesCount++;
        fixedImportsCount++;
        fs.writeFileSync(file, content);
        console.log(`✅ Исправлен файл: ${file}`);
      }
    }
  });

  return { filesProcessed: files.length, filesFixed: fixedFilesCount, importsFixed: fixedImportsCount };
};

// Выполняем обработку
console.log('🔍 Запуск процесса исправления импортов Enum...');

const srcResults = processFiles('src/**/*.ts');
const testsResults = processFiles('__tests__/**/*.ts');

console.log('\n🎉 Обработка завершена!');
console.log('📊 Статистика:');
console.log(`   - Обработано файлов в src: ${srcResults.filesProcessed}`);
console.log(`   - Исправлено файлов в src: ${srcResults.filesFixed}`);
console.log(`   - Обработано файлов в __tests__: ${testsResults.filesProcessed}`);
console.log(`   - Исправлено файлов в __tests__: ${testsResults.filesFixed}`);
console.log(`   - Всего исправлено импортов: ${srcResults.importsFixed + testsResults.importsFixed}`);
console.log(`   - Созданы резервные копии в: ${backupDir}`);
console.log('\n⭐ Запустите "pnpm typecheck" для проверки результатов'); 