import { ModeEnum } from './mode.enum';

export interface MySession {
  mode: ModeEnum;
  is_ru: boolean;
  userId: number;
  chatId: number;
  messageId?: number;
  modelName?: string;
  modelId?: string;
  modelFile?: string;
  modelUrl?: string;
  requestId?: string;
}

export interface SessionConfig {
  mode: ModeEnum;
  is_ru: boolean;
  userId: number;
  chatId: number;
}

export interface SessionUpdate extends Partial<MySession> {
  messageId?: number;
} 