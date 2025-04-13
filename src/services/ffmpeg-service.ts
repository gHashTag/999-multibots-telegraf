/**
 * Сервис для работы с FFmpeg
 * Включает функции для конвертации аудио/видео файлов
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Конвертирует голосовое сообщение (ogg) в mp3 формат
 * @param filePath Путь к аудиофайлу
 * @returns Путь к сконвертированному mp3 файлу
 */
export const convertVoiceToMp3 = async (filePath: string): Promise<string> => {
  try {
    const tempDir = os.tmpdir();
    const outputFilePath = path.join(tempDir, `${path.basename(filePath, path.extname(filePath))}.mp3`);
    
    // Выполняем команду ffmpeg для конвертации
    execSync(`ffmpeg -i "${filePath}" -c:a libmp3lame -q:a 4 "${outputFilePath}" -y`);
    
    // Проверяем, что файл был создан
    if (!fs.existsSync(outputFilePath)) {
      throw new Error('Ошибка при конвертации аудио: выходной файл не найден');
    }
    
    return outputFilePath;
  } catch (error) {
    console.error('Ошибка при конвертации аудио:', error);
    throw new Error('Не удалось конвертировать аудиофайл');
  }
};

/**
 * Извлекает аудио из видеофайла
 * @param filePath Путь к видеофайлу
 * @returns Путь к извлеченному аудиофайлу
 */
export const extractAudioFromVideo = async (filePath: string): Promise<string> => {
  try {
    const tempDir = os.tmpdir();
    const outputFilePath = path.join(tempDir, `${path.basename(filePath, path.extname(filePath))}_audio.mp3`);
    
    // Извлекаем аудио из видео
    execSync(`ffmpeg -i "${filePath}" -q:a 0 -map a "${outputFilePath}" -y`);
    
    // Проверяем, что файл был создан
    if (!fs.existsSync(outputFilePath)) {
      throw new Error('Ошибка при извлечении аудио: выходной файл не найден');
    }
    
    return outputFilePath;
  } catch (error) {
    console.error('Ошибка при извлечении аудио из видео:', error);
    throw new Error('Не удалось извлечь аудио из видеофайла');
  }
};

/**
 * Получает длительность медиафайла (аудио или видео)
 * @param filePath Путь к медиафайлу
 * @returns Длительность в секундах
 */
export const getMediaDuration = async (filePath: string): Promise<number> => {
  try {
    // Получаем длительность файла с помощью ffprobe
    const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`).toString().trim();
    
    const duration = parseFloat(output);
    if (isNaN(duration)) {
      throw new Error('Не удалось определить длительность: некорректное значение');
    }
    
    return duration;
  } catch (error) {
    console.error('Ошибка при определении длительности файла:', error);
    throw new Error('Не удалось определить длительность медиафайла');
  }
};

/**
 * Разделяет аудиофайл на части указанной длительности
 * @param filePath Путь к аудиофайлу
 * @param chunkDuration Длительность одной части в секундах
 * @returns Массив путей к созданным частям
 */
export const splitAudioIntoChunks = async (filePath: string, chunkDuration: number = 600): Promise<string[]> => {
  try {
    const duration = await getMediaDuration(filePath);
    const tempDir = os.tmpdir();
    const baseName = path.basename(filePath, path.extname(filePath));
    const chunkPaths: string[] = [];
    
    // Определяем количество частей
    const numChunks = Math.ceil(duration / chunkDuration);
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const outputPath = path.join(tempDir, `${baseName}_chunk${i + 1}.mp3`);
      
      // Создаем часть аудио
      execSync(`ffmpeg -i "${filePath}" -ss ${startTime} -t ${chunkDuration} -acodec copy "${outputPath}" -y`);
      
      // Проверяем, что файл был создан
      if (fs.existsSync(outputPath)) {
        chunkPaths.push(outputPath);
      }
    }
    
    if (chunkPaths.length === 0) {
      throw new Error('Не удалось разделить аудио на части: ни одна часть не была создана');
    }
    
    return chunkPaths;
  } catch (error) {
    console.error('Ошибка при разделении аудио на части:', error);
    throw new Error('Не удалось разделить аудиофайл на части');
  }
};

/**
 * Очищает временные файлы
 * @param filePaths Массив путей к файлам для удаления
 */
export const cleanupTempFiles = async (filePaths: string[]): Promise<void> => {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Удален временный файл: ${filePath}`);
      }
    } catch (error) {
      console.error(`Ошибка при удалении временного файла ${filePath}:`, error);
    }
  }
}; 