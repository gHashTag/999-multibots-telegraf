/**
 * Сервис для работы с транскрипцией аудио
 * Использует OpenAI Whisper API через openai-service
 */

import {
  TranscriptionSettings,
  TranscriptionResult,
  FileInfo,
  AudioProcessingEvent,
  AudioProcessingCompletedEvent,
} from '@/scenes/audioToTextScene/types'
import {
  TranscriptionModels,
  TranscriptionLanguages,
  MAX_SINGLE_AUDIO_DURATION,
  CHUNK_SIZE,
  MAX_FILE_SIZE,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_VIDEO_FORMATS,
} from '@/scenes/audioToTextScene/constants'
import {
  transcribeAudioWhisper,
  transcribeLongAudioWithSettings,
  getAudioFileFromMessage,
} from './openai-service'

/**
 * Проверяет поддерживаемость формата файла
 */
export function isSupportedFormat(fileType: string): boolean {
  return (
    SUPPORTED_AUDIO_FORMATS.includes(fileType) ||
    SUPPORTED_VIDEO_FORMATS.includes(fileType)
  )
}

/**
 * Проверяет размер файла
 */
export function isValidFileSize(fileSize: number): boolean {
  return fileSize <= MAX_FILE_SIZE
}

/**
 * Обрабатывает аудиофайл для транскрипции
 */
export async function processAudioFile(
  fileInfo: FileInfo,
  settings: TranscriptionSettings
): Promise<TranscriptionResult> {
  if (!isSupportedFormat(fileInfo.fileType)) {
    throw new Error('Unsupported file format')
  }

  if (!isValidFileSize(fileInfo.fileSize)) {
    throw new Error('File size exceeds maximum limit')
  }

  // Если длительность превышает лимит, разбиваем на части
  if (fileInfo.duration && fileInfo.duration > MAX_SINGLE_AUDIO_DURATION) {
    const chunks = splitAudioIntoChunks(fileInfo.duration)
    // TODO: Implement audio splitting logic
    return transcribeLongAudioWithSettings([fileInfo.filePath], settings)
  }

  return transcribeAudioWhisper(fileInfo.filePath, settings)
}

/**
 * Разбивает аудио на чанки по длительности
 */
function splitAudioIntoChunks(duration: number): Array<{ start: number; end: number }> {
  const chunks: Array<{ start: number; end: number }> = []
  let currentTime = 0

  while (currentTime < duration) {
    const end = Math.min(currentTime + CHUNK_SIZE, duration)
    chunks.push({ start: currentTime, end })
    currentTime = end
  }

  return chunks
}

/**
 * Создает событие для обработки аудио
 */
export function createAudioProcessingEvent(
  userId: number,
  fileInfo: FileInfo,
  settings: TranscriptionSettings
): AudioProcessingEvent {
  const chunks = fileInfo.duration && fileInfo.duration > MAX_SINGLE_AUDIO_DURATION
    ? splitAudioIntoChunks(fileInfo.duration)
    : undefined

  return {
    userId,
    fileId: fileInfo.fileId,
    settings,
    chunks,
  }
}

/**
 * Создает событие завершения обработки аудио
 */
export function createAudioProcessingCompletedEvent(
  userId: number,
  fileId: string,
  result: TranscriptionResult
): AudioProcessingCompletedEvent {
  return {
    userId,
    fileId,
    taskId: result.taskId,
    result,
  }
} 