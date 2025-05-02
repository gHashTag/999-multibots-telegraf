import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем резервную копию
const timestamp = new Date().toISOString().replace(/[:.]/g, '_').slice(0, 17);
const backupSrcPath = path.join(__dirname, `../backup_src_mode_enum_${timestamp}`);
const backupTestsPath = path.join(__dirname, `../backup___tests___mode_enum_${timestamp}`);

console.log(`Creating backup of src directory at ${backupSrcPath}`);
if (!fs.existsSync(backupSrcPath)) {
  fs.mkdirSync(backupSrcPath, { recursive: true });
}

console.log(`Creating backup of __tests__ directory at ${backupTestsPath}`);
if (!fs.existsSync(backupTestsPath)) {
  fs.mkdirSync(backupTestsPath, { recursive: true });
}

// Находим все файлы TypeScript в src и __tests__ директориях
const srcFiles = await glob('src/**/*.ts');
const testFiles = await glob('__tests__/**/*.ts');

let fixedFiles = 0;

// Функция для обработки файла
function processFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Создаем структуру директорий для бэкапа
  const relativePath = file.startsWith('src/') 
    ? path.join(backupSrcPath, file.substring(4)) 
    : path.join(backupTestsPath, file.substring(10));
  
  const backupDir = path.dirname(relativePath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  // Сохраняем оригинальный файл
  fs.writeFileSync(relativePath, content);
  
  // Исправляем import type { ModeEnum } на обычный import
  let updatedContent = content;
  
  // 1. Замена импорта ModeEnum с type на обычный импорт
  if (content.includes('import type { ModeEnum }') && 
      (content.match(/ModeEnum\./g) || content.includes('[ModeEnum') || 
       content.includes('(ModeEnum') || content.includes('=ModeEnum') ||
       content.includes(' ModeEnum,'))) {
    updatedContent = content.replace(
      /import type { ModeEnum/g, 
      'import { ModeEnum'
    );
    return { file, updatedContent, hasChanges: updatedContent !== content };
  }
  
  return { file, updatedContent, hasChanges: false };
}

// Обрабатываем все файлы
for (const file of [...srcFiles, ...testFiles]) {
  const { file: fileName, updatedContent, hasChanges } = processFile(file);
  
  if (hasChanges) {
    fs.writeFileSync(fileName, updatedContent);
    fixedFiles++;
    console.log(`Fixed ModeEnum imports in ${fileName}`);
  }
}

console.log(`Done! Fixed ${fixedFiles} files with ModeEnum import issues.`); 