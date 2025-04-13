/**
 * Типы для сцены Audio-to-Text
 */

import { TranscriptionLanguages, TranscriptionModels } from './constants';
import { Context, Scenes } from 'telegraf';
import { WizardContext, WizardSessionData } from 'telegraf/scenes/wizard';

/**
 * Расширение стандартной сессии для хранения данных транскрипции
 */
export interface AudioToTextSession extends Scenes.WizardSessionData {
  // Основные параметры для транскрипции
  fileId?: string;
  filePath?: string;
  fileType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  
  // Идентификатор задачи
  taskId?: string;
  
  // Стоимость транскрипции
  amount?: number;
  
  // Настройки транскрипции
  transcriptionModel?: TranscriptionModels;
  transcriptionLanguage?: TranscriptionLanguages;
  accuracy?: 'low' | 'medium' | 'high';
  
  // Результаты транскрипции
  transcriptionResult?: string;
  transcriptionParts?: string[];
  transcriptionStatus?: 'processing' | 'completed' | 'failed';
  
  // Форматированные данные для отображения
  isLongAudio?: boolean;
  totalChunks?: number;
  processedChunks?: number;
  
  // Для отслеживания больших файлов
  chunks?: Array<{
    start: number;
    end: number;
    processed: boolean;
    result?: string;
  }>;
}

/**
 * Контекст сцены Audio-to-Text
 */
export interface AudioToTextContext extends WizardContext {
  session: WizardSessionData & {
    audioToText: AudioToTextSession;
  }
}

/**
 * Интерфейс для настроек транскрипции
 */
export interface TranscriptionSettings {
  model: TranscriptionModels;
  language: TranscriptionLanguages;
  accuracy: 'low' | 'medium' | 'high';
}

/**
 * Интерфейс для файловой информации
 */
export interface FileInfo {
  fileId: string;
  filePath: string;
  fileType: string;
  fileName: string;
  fileSize: number;
  duration?: number;
  isVideo?: boolean;
}

/**
 * Интерфейс для результата транскрипции
 */
export interface TranscriptionResult {
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language?: string;
  taskId: string;
}

/**
 * Интерфейс для события обработки аудио
 */
export interface AudioProcessingEvent {
  userId: number;
  fileId: string;
  settings: TranscriptionSettings;
  chunks?: Array<{
    start: number;
    end: number;
  }>;
}

/**
 * Интерфейс для события завершения обработки аудио
 */
export interface AudioProcessingCompletedEvent {
  userId: number;
  fileId: string;
  taskId: string;
  result: TranscriptionResult;
} 