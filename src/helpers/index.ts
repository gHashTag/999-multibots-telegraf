console.log('Environment check:', {
  nodeEnv: process.env.NODE_ENV,
})

export const isDev = process.env.NODE_ENV === 'development'

export * from './pulse'
export * from './deleteFile'
export * from './language'
export * from './images'
export * from './delay'
export * from './ensureDirectoryExistence'
export * from './error/errorMessageAdmin'
export * from './downloadFile'
export * from './saveFileLocally'
export * from './inngest/balanceHelpers'
export * from './pulseNeuroImageV2'
export * from './processApiResponse'
export * from './error/errorMessage'
export * from './createVoiceAvatar'


/**
 * Форматирует результат транскрипции для отображения пользователю
 * @param transcriptionResult Результат транскрипции
 * @returns Отформатированный текст
 */
export const formatTranscriptionResult = (transcriptionResult: any): string => {
  if (!transcriptionResult || !transcriptionResult.text) {
    return 'Текст не распознан.';
  }

  let formattedText = `<b>📝 Результат транскрипции:</b>\n\n`;
  formattedText += transcriptionResult.text;

  if (transcriptionResult.language) {
    formattedText += `\n\n<i>Определенный язык: ${transcriptionResult.language}</i>`;
  }

  return formattedText;
};
