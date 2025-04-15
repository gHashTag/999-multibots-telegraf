/**
 * Константы для сцены Audio-to-Text
 */

export const SCENE_ID = 'audioToTextScene'

// Модели для транскрипции
export enum TranscriptionModels {
  WHISPER_TINY = 'whisper-tiny',
  WHISPER_BASE = 'whisper-base',
  WHISPER_SMALL = 'whisper-small',
  WHISPER_MEDIUM = 'whisper-medium',
  WHISPER_LARGE = 'whisper-large',
}

// Цены за минуту по моделям
export const PRICE_PER_MINUTE = {
  [TranscriptionModels.WHISPER_TINY]: 2,
  [TranscriptionModels.WHISPER_BASE]: 4,
  [TranscriptionModels.WHISPER_SMALL]: 6,
  [TranscriptionModels.WHISPER_MEDIUM]: 10,
  [TranscriptionModels.WHISPER_LARGE]: 15,
}

// Максимальная длительность аудио в секундах для обработки без разбивки
export const MAX_SINGLE_AUDIO_DURATION = 600 // 10 минут

// Размер чанка при разбивке длинного аудио (в секундах)
export const CHUNK_SIZE = 600 // 10 минут

// Максимальный размер файла для загрузки (в байтах)
export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

// Поддерживаемые форматы аудио и видео
export const SUPPORTED_AUDIO_FORMATS = [
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/mpeg',
]
export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/quicktime',
  'video/webm',
]

// Форматы экспорта
export enum ExportFormats {
  TXT = 'txt',
  DOCX = 'docx',
  PDF = 'pdf',
  JSON = 'json',
}

// Языки для транскрипции
export enum TranscriptionLanguages {
  AUTO = 'auto',
  RUSSIAN = 'ru',
  ENGLISH = 'en',
}

// События Inngest для обработки аудио
export const AUDIO_TRANSCRIPTION_EVENT = 'audio/transcription'
export const AUDIO_PROCESSING_COMPLETED_EVENT = 'audio/processing.completed'

// Коллбэк-данные для кнопок
export const CALLBACKS = {
  EXPORT_TXT: 'export_txt',
  EXPORT_DOCX: 'export_docx',
  EXPORT_PDF: 'export_pdf',
  EXPORT_JSON: 'export_json',
  SETTINGS: 'transcription_settings',
  LANG_AUTO: 'lang_auto',
  LANG_RU: 'lang_ru',
  LANG_EN: 'lang_en',
  MODEL_TINY: 'model_tiny',
  MODEL_BASE: 'model_base',
  MODEL_SMALL: 'model_small',
  MODEL_MEDIUM: 'model_medium',
  MODEL_LARGE: 'model_large',
  ACCURACY_LOW: 'accuracy_low',
  ACCURACY_MEDIUM: 'accuracy_medium',
  ACCURACY_HIGH: 'accuracy_high',
  START_TRANSCRIPTION: 'start_transcription',
}
