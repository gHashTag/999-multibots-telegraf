import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Путь к файлу интерфейса
const interfaceFilePath = path.join(__dirname, '../src/interfaces/telegram-bot.interface.ts');
const backupPath = path.join(__dirname, `../backup_src_telegram_context_${new Date().toISOString().replace(/[:.]/g, '_').slice(0, 17)}`);

// Создаем резервную копию
console.log(`Creating backup of src directory at ${backupPath}`);
if (!fs.existsSync(backupPath)) {
  fs.mkdirSync(backupPath, { recursive: true });
}

const backupFilePath = path.join(backupPath, 'telegram-bot.interface.ts');
fs.copyFileSync(interfaceFilePath, backupFilePath);

// Читаем оригинальный файл
const originalContent = fs.readFileSync(interfaceFilePath, 'utf8');

// Обновленный интерфейс MyContext
const updatedContent = originalContent.replace(
  /export interface MyContext extends Context[^}]*?}/s,
  `export interface MyContext extends Context {
  session: MySession;
  scene: SceneContextScene<MyContext, WizardSessionData>;
  wizard: WizardContextWizard<MyContext>;
  update: Update.MessageUpdate | Update.CallbackQueryUpdate;
  match?: RegExpExecArray;
  // Добавляем свойства, которые требуются из Context
  telegram: any;
  botInfo?: any;
  state: any;
  updateType?: string;
  from?: any;
  chat?: any;
  reply: (text: string, extra?: any) => Promise<any>;
}`
);

// Записываем обновленный контент
fs.writeFileSync(interfaceFilePath, updatedContent);

console.log('Updated MyContext interface in telegram-bot.interface.ts');

// Проверяем наличие необходимых импортов
if (!updatedContent.includes('import type { Update }')) {
  // Добавляем импорт Update, если его нет
  const updatedWithImports = updatedContent.replace(
    /import type { Mode } from "\.\/modes";/,
    `import type { Update } from 'telegraf/typings/core/types/typegram';\nimport type { Mode } from "./modes";`
  );
  fs.writeFileSync(interfaceFilePath, updatedWithImports);
  console.log('Added missing Update import');
}

console.log('Done! Interface updated successfully.'); 