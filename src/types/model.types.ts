import { ModeEnum } from './mode.enum';
import { MyContext } from '@/interfaces/telegram-bot.interface'

export interface ModelFile {
  path: string;
  size: number;
  name: string;
}

export interface ModelTrainingConfig {
  modelName: string;
  telegram_id: string;
  triggerWord: string;
  steps: number;
  botName: string;
  is_ru: boolean;
}

export interface ModelTrainingRequest {
  file: ModelFile;
  config: ModelTrainingConfig;
}

export interface ModelTrainingResponse {
  success: boolean;
  error?: string;
  modelUrl?: string;
  requestId?: string;
}

export interface ModelTrainingDirectResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

export interface ModelTrainingEvent {
  modelName: string;
  modelFile: string;
  telegramId: string;
  ctx: MyContext;
  _test?: {
    inngest_error?: boolean;
  };
}

export interface ModelUploadResult {
  success: boolean;
  error?: string;
  url?: string;
} 