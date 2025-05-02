import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем резервную копию
const timestamp = new Date().toISOString().replace(/[:.]/g, '_').slice(0, 17);
const backupSrcPath = path.join(__dirname, `../backup_src_update_import_${timestamp}`);

console.log(`Creating backup of src directory at ${backupSrcPath}`);
if (!fs.existsSync(backupSrcPath)) {
  fs.mkdirSync(backupSrcPath, { recursive: true });
}

// Находим все файлы с проблемным импортом
const srcFiles = await glob('src/**/*.ts');

let fixedFilesCount = 0;

// Обрабатываем каждый файл
for (const file of srcFiles) {
  // Читаем содержимое файла
  const content = fs.readFileSync(file, 'utf8');
  let updatedContent = content;
  let hasChanges = false;

  // Проверяем на наличие проблемного импорта
  if (content.includes("import type { Update } from 'telegraf/typings/core/types/typegram'")) {
    // Создаем бэкап файла
    const relativePath = file.replace('src/', '');
    const backupFilePath = path.join(backupSrcPath, relativePath);
    const backupDir = path.dirname(backupFilePath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.writeFileSync(backupFilePath, content);

    // Исправляем импорт
    updatedContent = updatedContent.replace(
      "import type { Update } from 'telegraf/typings/core/types/typegram'",
      "import type { Update } from 'telegraf/types'"
    );
    hasChanges = true;
  }

  // Если в файле есть несколько импортов Update, исправляем дубликаты
  if (content.includes("Update } from 'telegraf/types'") && content.includes("Update } from 'telegraf/typings/core/types/typegram'")) {
    // Создаем бэкап файла, если еще не создан
    if (!hasChanges) {
      const relativePath = file.replace('src/', '');
      const backupFilePath = path.join(backupSrcPath, relativePath);
      const backupDir = path.dirname(backupFilePath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.writeFileSync(backupFilePath, content);
    }
    
    // Удаляем дублирующую строку импорта
    updatedContent = updatedContent.replace(
      "import type { Update } from 'telegraf/typings/core/types/typegram'\n",
      ""
    );
    hasChanges = true;
  }

  // Если были изменения, сохраняем файл
  if (hasChanges) {
    fs.writeFileSync(file, updatedContent);
    fixedFilesCount++;
    console.log(`Fixed Update import in ${file}`);
  }
}

console.log(`Done! Fixed Update imports in ${fixedFilesCount} files.`); 