import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к файлу store/index.ts
const storeFilePath = path.join(__dirname, '../src/store/index.ts');
const backupPath = path.join(__dirname, `../backup_src_default_session_${new Date().toISOString().replace(/[:.]/g, '_').slice(0, 17)}`);

// Создаем резервную копию
console.log(`Creating backup of store directory at ${backupPath}`);
if (!fs.existsSync(backupPath)) {
  fs.mkdirSync(backupPath, { recursive: true });
}

const backupFilePath = path.join(backupPath, 'store/index.ts');
const backupDir = path.dirname(backupFilePath);
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Читаем оригинальный файл
const content = fs.readFileSync(storeFilePath, 'utf8');
fs.writeFileSync(backupFilePath, content);

// Обновляем содержимое файла
let updatedContent = content.replace(
  /export const defaultSession: MySession = \{([^}]*)\}/s,
  `export const defaultSession: MySession = {$1,
  __scenes: {}
}`
);

// Записываем обновленный файл
fs.writeFileSync(storeFilePath, updatedContent);

console.log('Fixed defaultSession in store/index.ts by adding __scenes property'); 