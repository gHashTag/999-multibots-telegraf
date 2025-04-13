/**
 * Сервис для работы с OpenAI API
 * Включает функции для транскрипции аудио с помощью Whisper API
 */

import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptionLanguages, TranscriptionModels } from '@/scenes/audioToTextScene/constants';
import { TranscriptionResult, TranscriptionSettings } from '@/scenes/audioToTextScene/types';

const OPENAI_API_URL = 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Интерфейс для сегмента транскрипции
 */
export interface Segment {
  id?: number;
  seek?: number;
  start: number;
  end: number;
  text: string;
  tokens?: number[];
  temperature?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
}

/**
 * Транскрибирует аудиофайл с помощью OpenAI Whisper API
 * @param filePath Путь к аудиофайлу
 * @param settings Настройки транскрипции
 * @returns Результат транскрипции
 */
export async function transcribeAudioWhisper(
  filePath: string, 
  settings: TranscriptionSettings
): Promise<TranscriptionResult> {
  try {
    const formData = new FormData();
    
    // Добавляем файл
    formData.append('file', fs.createReadStream(filePath));
    
    // Добавляем модель
    formData.append('model', settings.model);
    
    // Если указан язык, добавляем его (кроме auto)
    if (settings.language !== TranscriptionLanguages.AUTO) {
      formData.append('language', settings.language);
    }
    
    // Добавляем опции в зависимости от точности
    const response_format = 'json';
    formData.append('response_format', response_format);
    
    // Уровень детализации зависит от настройки accuracy
    const temperature = settings.accuracy === 'high' ? 0.0 : 
                        settings.accuracy === 'medium' ? 0.4 : 0.8;
    formData.append('temperature', temperature.toString());
    
    // Получаем сегменты для фиксации времени
    formData.append('timestamp_granularities', ['segment']);
    
    // Вызываем API
    const response = await axios.post(
      `${OPENAI_API_URL}/audio/transcriptions`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    // Генерируем ID задачи
    const taskId = uuidv4();
    
    // Обрабатываем ответ
    const result: TranscriptionResult = {
      text: response.data.text,
      segments: response.data.segments,
      language: response.data.language,
      taskId
    };
    
    return result;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe audio: Unknown error');
  }
}

/**
 * Транскрибирует большой аудиофайл, разбивая его на части
 * @param filePaths Массив путей к частям аудиофайла
 * @param settings Настройки транскрипции
 * @returns Результат транскрипции
 */
export async function transcribeLongAudioWithSettings(
  filePaths: string[], 
  settings: TranscriptionSettings
): Promise<TranscriptionResult> {
  try {
    // Генерируем ID задачи
    const taskId = uuidv4();
    
    // Транскрибируем каждую часть
    const results = await Promise.all(
      filePaths.map(filePath => transcribeAudioWhisper(filePath, settings))
    );
    
    // Объединяем текстовые результаты
    const combinedText = results.map(result => result.text).join(' ');
    
    // Объединяем сегменты, корректируя время начала и окончания
    const combinedSegments: Segment[] = [];
    let segmentOffset = 0;
    
    results.forEach((result, index) => {
      // Вычисляем смещение на основе предыдущих сегментов
      if (index > 0) {
        const prevResult = results[index - 1];
        if (prevResult && prevResult.segments && prevResult.segments.length > 0) {
          const lastSegment = prevResult.segments[prevResult.segments.length - 1];
          if (lastSegment) {
            segmentOffset = lastSegment.end;
          }
        }
      }
      
      // Добавляем сегменты текущей части с учетом смещения
      if (result.segments) {
        const adjustedSegments = result.segments.map(segment => ({
          start: segment.start + segmentOffset,
          end: segment.end + segmentOffset,
          text: segment.text
        }));
        
        combinedSegments.push(...adjustedSegments);
      }
    });
    
    return {
      text: combinedText,
      segments: combinedSegments,
      language: results[0]?.language || 'unknown',
      taskId
    };
  } catch (error) {
    console.error('Error transcribing long audio:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe long audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe long audio: Unknown error');
  }
}

/**
 * Get audio file from message
 */
export const getAudioFileFromMessage = async (telegram: any, fileId: string) => {
  try {
    const fileInfo = await telegram.getFile(fileId);
    
    if (!fileInfo || !fileInfo.file_path) {
      throw new Error('File not found or file_path is missing');
    }
    
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
    
    // Create a temporary directory for the file if it doesn't exist
    const tempDir = './temp';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    // Define file path
    const filePath = `${tempDir}/${fileId}.${fileInfo.file_path.split('.').pop()}`;
    
    // Download file
    const response = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream'
    });
    
    // Save file to disk
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    
    return new Promise<{ fileId: string, filePath: string }>((resolve, reject) => {
      writer.on('finish', () => resolve({ fileId, filePath }));
      writer.on('error', reject);
    });
  } catch (error: unknown) {
    console.error('Error getting audio file:', error);
    throw new Error('Failed to get audio file');
  }
};

/**
 * Simple transcribe audio using OpenAI's Whisper API without additional settings
 */
export const transcribeAudioSimple = async (filePath: string) => {
  try {
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    formData.append('file', fileStream);
    formData.append('model', 'whisper-1');
    
    const response = await axios.post(`${OPENAI_API_URL}/audio/transcriptions`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });
    
    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting temporary file:', err);
    }
    
    return response.data;
  } catch (error: unknown) {
    console.error('Error transcribing audio:', error);
    
    // Clean up temporary file even on error
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting temporary file:', err);
    }
    
    throw new Error('Failed to transcribe audio');
  }
};

/**
 * Transcribe audio using OpenAI's Whisper API from Telegram
 */
export const transcribeAudioFromTelegram = async (fileId: string, telegramBot: any) => {
  try {
    // Get the audio file from the message
    const { filePath } = await getAudioFileFromMessage(telegramBot, fileId);
    
    // Transcribe the audio
    const transcription = await transcribeAudioSimple(filePath);
    
    return transcription;
  } catch (error: unknown) {
    console.error('Error in transcribeAudio:', error);
    throw new Error('Failed to transcribe audio');
  }
};

/**
 * Transcribe audio file to segments
 */
export const transcribeAudioToSegments = async (filePath: string, language?: string): Promise<Segment[]> => {
  try {
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    formData.append('file', fileStream);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    
    if (language) {
      formData.append('language', language);
    }
    
    const response = await axios.post(`${OPENAI_API_URL}/audio/transcriptions`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });
    
    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting temporary file:', err);
    }
    
    return response.data.segments;
  } catch (error: unknown) {
    console.error('Error transcribing audio to segments:', error);
    
    // Clean up temporary file even on error
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting temporary file:', err);
    }
    
    throw new Error('Failed to transcribe audio to segments');
  }
};

/**
 * Transcribe audio with basic options
 */
export const transcribeAudioBasic = async (filePath: string, language?: string, model = 'whisper-1'): Promise<string> => {
  try {
    const formData = new FormData();
    const fileStream = fs.createReadStream(filePath);
    formData.append('file', fileStream);
    formData.append('model', model);
    
    if (language) {
      formData.append('language', language);
    }
    
    const response = await axios.post(`${OPENAI_API_URL}/audio/transcriptions`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      }
    });
    
    return response.data.text;
  } catch (error: unknown) {
    console.error('Error transcribing audio:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe audio: Unknown error');
  }
};

/**
 * Transcribe multiple audio files and combine them
 */
export const transcribeLongAudioBasic = async (
  filePaths: string[], 
  language?: string, 
  model = 'whisper-1',
  progressCallback?: (index: number, total: number) => void
): Promise<string> => {
  try {
    let result = '';
    const total = filePaths.length;
    
    for (let i = 0; i < filePaths.length; i++) {
      const text = await transcribeAudioBasic(filePaths[i], language, model);
      result += ' ' + text;
      
      if (progressCallback) {
        progressCallback(i + 1, total);
      }
    }
    
    return result.trim();
  } catch (error: unknown) {
    console.error('Error transcribing long audio:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to transcribe long audio: ${error.message}`);
    }
    throw new Error('Failed to transcribe long audio: Unknown error');
  }
}; 