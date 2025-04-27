import type { Scenes, Context } from 'telegraf';
import type { Message, Update } from 'telegraf/types';
import type { Mode } from './modes';
import type { Translation } from './translations.interface';
import type { ModelUrl } from './models.interface';
import type { User } from './user.interface';
import type { BroadcastContentType } from './broadcast.interface';
import type { SubscriptionType } from './subscription.interface';
import type { SessionPayment } from './payments.interface';

// Базовый тип для буферов файлов
export type BufferType = { buffer: Buffer; filename: string }[];

// Типы для сессии Scenes Wizard
export interface WizardSessionData extends Scenes.WizardSessionData {
  // Дополнительные данные сцены
  [key: string]: any;
}

// Базовый интерфейс для сессии
export interface MySession extends Scenes.WizardSession<WizardSessionData> {
  language?: string;
  selectedLanguage?: string;
  translation?: Translation;
  [key: string]: any;
}

// Экспортируем тип для имени бота, который использовался раньше
export type BotName = 'neuro_blogger_bot' | 'MetaMuse_Manifest_bot' | 'ZavaraBot' | 
  'LeeSolarbot' | 'NeuroLenaAssistant_bot' | 'NeurostylistShtogrina_bot' | 
  'Gaia_Kamskaia_bot' | 'ai_koshey_bot' | 'clip_maker_neuro_bot';

// Базовый контекст приложения
export interface MyContext extends Context<Update> {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext, WizardSessionData>;
  wizard: Scenes.WizardContextWizard<MyContext>;
  match?: RegExpExecArray;
}

// Типы для различных контекстов сообщений
export type MyMessageContext = MyContext & {
  message: Message.TextMessage;
};

export type MyTextMessageContext = MyContext & {
  message: Message.TextMessage;
  update: Update.MessageUpdate;
};

export type MyCallbackQueryContext = MyContext & {
  callbackQuery: { data: string };
  update: Update.CallbackQueryUpdate;
};

// Для совместимости со старыми требованиями
export type MyWizardContext = MyContext;

// Для обратной совместимости со старым кодом
export type SessionData = MySession;
export type WizardData = WizardSessionData;

// Вспомогательные типы
export interface TranslationButton {
  text: string;
  callback_data: string;
}

export type SceneInterface = {
  id: string;
  register: () => any;
};

export type BalanceOperationResult = {
  success: boolean;
  message: string;
  operation?: {
    amount: number;
    old_balance: number;
    new_balance: number;
    operation_type: string;
  };
  error?: string;
};
