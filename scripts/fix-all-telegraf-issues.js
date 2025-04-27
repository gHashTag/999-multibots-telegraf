import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

// Получаем текущую директорию
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаем резервную копию
const timestamp = new Date().toISOString().replace(/[:.]/g, '_').slice(0, 17);
const backupSrcPath = path.join(__dirname, `../backup_src_telegraf_fixes_${timestamp}`);
const backupTestsPath = path.join(__dirname, `../backup___tests___telegraf_fixes_${timestamp}`);

console.log(`Creating backup of src directory at ${backupSrcPath}`);
if (!fs.existsSync(backupSrcPath)) {
  fs.mkdirSync(backupSrcPath, { recursive: true });
}

console.log(`Creating backup of __tests__ directory at ${backupTestsPath}`);
if (!fs.existsSync(backupTestsPath)) {
  fs.mkdirSync(backupTestsPath, { recursive: true });
}

// 1. Сначала обновляем основной интерфейс MyContext
const interfaceFilePath = path.join(__dirname, '../src/interfaces/telegram-bot.interface.ts');
const interfaceContent = fs.readFileSync(interfaceFilePath, 'utf8');

// Сохраняем оригинальный файл
const backupInterfaceFilePath = path.join(backupSrcPath, 'interfaces/telegram-bot.interface.ts');
const backupInterfaceDir = path.dirname(backupInterfaceFilePath);
if (!fs.existsSync(backupInterfaceDir)) {
  fs.mkdirSync(backupInterfaceDir, { recursive: true });
}
fs.writeFileSync(backupInterfaceFilePath, interfaceContent);

// Обновляем интерфейс MyContext
let updatedInterfaceContent = interfaceContent;

// Проверяем наличие импорта Update
if (!updatedInterfaceContent.includes('import type { Update }')) {
  // Добавляем импорт Update, если его нет
  updatedInterfaceContent = updatedInterfaceContent.replace(
    /import type { Mode } from "\.\/modes";/,
    `import type { Update } from 'telegraf/typings/core/types/typegram';\nimport type { Mode } from "./modes";`
  );
  console.log('Added missing Update import');
}

// Обновляем интерфейс MyContext
updatedInterfaceContent = updatedInterfaceContent.replace(
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
  me?: string;
  tg?: any;
  message?: any;
  editedMessage?: any;
  inlineQuery?: any;
  callbackQuery?: any;
  shippingQuery?: any;
  preCheckoutQuery?: any;
  chosenInlineResult?: any;
  channelPost?: any;
  editedChannelPost?: any;
  messageReaction?: any;
  messageReactionCount?: any;
  inlineMessageReactionCount?: any;
  poll?: any;
  pollAnswer?: any;
  myChatMember?: any;
  chatMember?: any;
  chatJoinRequest?: any;
  chatBoost?: any;
  removedChatBoost?: any;
  messageReaction?: any;
  businessConnection?: any;
  businessMessage?: any;
  from?: any;
  chat?: any;
  reply: (text: string, extra?: any) => Promise<any>;
  replyWithMarkdown: (text: string, extra?: any) => Promise<any>;
  replyWithHTML: (text: string, extra?: any) => Promise<any>;
  replyWithPhoto: (photo: any, extra?: any) => Promise<any>;
  replyWithAudio: (audio: any, extra?: any) => Promise<any>;
  replyWithDocument: (document: any, extra?: any) => Promise<any>;
  replyWithVideo: (video: any, extra?: any) => Promise<any>;
  replyWithAnimation: (animation: any, extra?: any) => Promise<any>;
  replyWithVoice: (voice: any, extra?: any) => Promise<any>;
  replyWithVideoNote: (videoNote: any, extra?: any) => Promise<any>;
  replyWithMediaGroup: (media: any[], extra?: any) => Promise<any>;
  replyWithLocation: (latitude: number, longitude: number, extra?: any) => Promise<any>;
  replyWithVenue: (latitude: number, longitude: number, title: string, address: string, extra?: any) => Promise<any>;
  replyWithContact: (phoneNumber: string, firstName: string, extra?: any) => Promise<any>;
  replyWithSticker: (sticker: any, extra?: any) => Promise<any>;
  replyWithInvoice: (invoice: any, extra?: any) => Promise<any>;
  replyWithGame: (gameName: string, extra?: any) => Promise<any>;
  replyWithDice: (emoji?: string, extra?: any) => Promise<any>;
  replyWithChatAction: (action: string) => Promise<any>;
  sendChatAction: (action: string) => Promise<any>;
  editMessageText: (text: string, extra?: any) => Promise<any>;
  editMessageCaption: (caption: string, extra?: any) => Promise<any>;
  editMessageMedia: (media: any, extra?: any) => Promise<any>;
  editMessageReplyMarkup: (markup: any) => Promise<any>;
  editMessageLiveLocation: (latitude: number, longitude: number, extra?: any) => Promise<any>;
  stopMessageLiveLocation: (extra?: any) => Promise<any>;
  answerCbQuery: (text?: string, extra?: any) => Promise<any>;
  answerGameQuery: (url: string) => Promise<any>;
  answerInlineQuery: (results: any[], extra?: any) => Promise<any>;
  answerShippingQuery: (ok: boolean, extra?: any) => Promise<any>;
  answerPreCheckoutQuery: (ok: boolean, extra?: any) => Promise<any>;
  kickChatMember: (userId: number, extra?: any) => Promise<any>;
  unbanChatMember: (userId: number, extra?: any) => Promise<any>;
  restrictChatMember: (userId: number, extra?: any) => Promise<any>;
  promoteChatMember: (userId: number, extra?: any) => Promise<any>;
  setChatAdministratorCustomTitle: (userId: number, title: string) => Promise<any>;
  setChatPhoto: (photo: any) => Promise<any>;
  deleteChatPhoto: () => Promise<any>;
  setChatTitle: (title: string) => Promise<any>;
  setChatDescription: (description: string) => Promise<any>;
  pinChatMessage: (messageId: number, extra?: any) => Promise<any>;
  unpinChatMessage: (messageId?: number) => Promise<any>;
  unpinAllChatMessages: () => Promise<any>;
  getChatMember: (userId: number) => Promise<any>;
  setChatPermissions: (permissions: any) => Promise<any>;
  getChat: () => Promise<any>;
  getChatAdministrators: () => Promise<any>;
  getChatMembersCount: () => Promise<any>;
  getFile: (fileId: string) => Promise<any>;
  getFileLink: (fileId: string) => Promise<string>;
  getGameHighScores: (userId: number, extra?: any) => Promise<any>;
  deleteMessage: (messageId?: number) => Promise<any>;
  leaveChat: () => Promise<any>;
  exportChatInviteLink: () => Promise<any>;
  setChatMenuButton: (menuButton?: any) => Promise<any>;
  getChatMenuButton: () => Promise<any>;
  setMyDefaultAdministratorRights: (rights?: any) => Promise<any>;
  getMyDefaultAdministratorRights: (extra?: any) => Promise<any>;
  createChatInviteLink: (extra?: any) => Promise<any>;
  editChatInviteLink: (link: string, extra?: any) => Promise<any>;
  revokeChatInviteLink: (link: string) => Promise<any>;
  setChatStickerSet: (setName: string) => Promise<any>;
  deleteChatStickerSet: () => Promise<any>;
  setStickerPositionInSet: (sticker: string, position: number) => Promise<any>;
  setStickerSetThumb: (name: string, userId: number, thumb?: any) => Promise<any>;
  deleteStickerFromSet: (sticker: string) => Promise<any>;
  uploadStickerFile: (userId: number, pngSticker: any) => Promise<any>;
  createNewStickerSet: (userId: number, name: string, title: string, extra?: any) => Promise<any>;
  addStickerToSet: (userId: number, name: string, extra?: any) => Promise<any>;
}`
);

// Обновляем интерфейс MySession
updatedInterfaceContent = updatedInterfaceContent.replace(
  /export interface MySession extends Scenes.WizardSession<WizardSessionData> {[^}]*?}/s,
  `export interface MySession extends Scenes.WizardSession<WizardSessionData> {
  cursor: number
  mode: ModeEnum
  currentScene?: string | null
  neuroPhotoInitialized?: boolean
  subscription?: SubscriptionType
  selectedSize?: string
  bypass_payment_check?: boolean
  images: BufferType
  modelName?: string
  targetUserId: number
  username?: string
  triggerWord?: string
  steps?: number
  videoUrl?: string
  audioUrl?: string
  email?: string
  inviteCode?: string
  inviter?: string
  paymentAmount?: number
  voiceDescription?: string
  subscriptionStep?:
    | 'LOADING_TRANSLATIONS'
    | 'LOADING_MODELS'
    | 'LOADING_SUBSCRIPTION'
    | 'LOADING_PAYMENT'
    | 'LOADING_PAYMENT_LINK'
    | 'LOADING_PAYMENT_STATUS'
    | 'LOADING_PAYMENT_CONFIRMATION'
    | 'LOADING_PAYMENT_SUCCESS'
    | 'LOADING_PAYMENT_FAILURE'
    | 'SHOWING_OPTIONS'
    | 'SUBSCRIPTION_SELECTED'
  imageUrl?: string
  prompt?: string
  userModel: UserModel
  selectedModel?: string
  videoModel?: string
  translations?: Translation[]
  buttons?: TranslationButton[]
  selectedPayment?: SessionPayment
  memory?: Memory
  attempts?: number
  amount?: number
  ru?: string
  en?: string
  lastCompletedVideoScene?: ModeEnum | null | undefined
  __scenes: Record<string, any>
}`
);

// Записываем обновленный контент
fs.writeFileSync(interfaceFilePath, updatedInterfaceContent);
console.log('Updated MyContext interface in telegram-bot.interface.ts');

// 2. Теперь обрабатываем остальные файлы с исправлениями
// Находим все файлы TypeScript в src директории
const srcFiles = await glob('src/**/*.ts');

let fixedFilesCount = 0;

// Обрабатываем каждый файл
for (const file of srcFiles) {
  // Читаем содержимое файла
  const content = fs.readFileSync(file, 'utf8');
  let updatedContent = content;
  let hasChanges = false;

  // Создаем бэкап
  const relativePath = file.replace('src/', '');
  const backupFilePath = path.join(backupSrcPath, relativePath);
  const backupDir = path.dirname(backupFilePath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  fs.writeFileSync(backupFilePath, content);

  // 1. Замена импорта ModeEnum с type на обычный импорт, если он используется как значение
  if (content.includes('import type { ModeEnum }') && 
      (content.match(/ModeEnum\./g) || content.includes('[ModeEnum') || 
       content.includes('(ModeEnum') || content.includes('=ModeEnum') ||
       content.includes(' ModeEnum,'))) {
    updatedContent = updatedContent.replace(
      /import type { ModeEnum/g, 
      'import { ModeEnum'
    );
    hasChanges = true;
  }

  // 2. Исправление вызовов WizardScene с MyContext
  if (content.includes('new Scenes.WizardScene<MyContext>') || content.includes('new WizardScene<MyContext>')) {
    // Добавляем импорт Update, если его нет
    if (!updatedContent.includes('import type { Update }') && !updatedContent.includes('import { Update }')) {
      if (updatedContent.includes('import { Context ')) {
        updatedContent = updatedContent.replace(
          /import { Context /g,
          'import { Context, Update '
        );
        hasChanges = true;
      } else if (updatedContent.includes('import type { Context ')) {
        updatedContent = updatedContent.replace(
          /import type { Context /g,
          'import type { Context, Update '
        );
        hasChanges = true;
      } else if (content.includes('import { Scenes }') || content.includes('import { Markup, Scenes }')) {
        // Добавляем импорт в следующую строку
        updatedContent = updatedContent.replace(
          /(import {.*?Scenes.*?} from 'telegraf')/,
          '$1\nimport type { Update } from \'telegraf/typings/core/types/typegram\''
        );
        hasChanges = true;
      }
    }
  }

  // Если были изменения, сохраняем файл
  if (hasChanges) {
    fs.writeFileSync(file, updatedContent);
    fixedFilesCount++;
    console.log(`Fixed issues in ${file}`);
  }
}

console.log(`Done! Fixed issues in ${fixedFilesCount} files.`);
console.log('NOTE: Many TypeScript errors may still remain and require manual fixes.');
console.log('Recommendation: Update the interface of MyContext to extend Context<Update> properly and fix scene definitions manually.'); 