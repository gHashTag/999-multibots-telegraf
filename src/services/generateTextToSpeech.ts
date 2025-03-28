import { inngest } from '@/core/inngest/clients'
import { v4 as uuidv4 } from 'uuid'

interface TextToSpeechResponse {
  success: boolean
  audioUrl?: string
  message?: string
}

export async function generateTextToSpeech(
  text: string,
  voice_id: string,
  telegram_id: number,
  username: string,
  isRu: boolean,
  botName: string
): Promise<TextToSpeechResponse> {
  try {
    // Валидация входных параметров
    if (!text) {
      throw new Error('Text is required')
    }
    if (!username) {
      throw new Error('Username is required')
    }
    if (!telegram_id) {
      throw new Error('Telegram ID is required')
    }
    if (!voice_id) {
      throw new Error('Voice ID is required')
    }

    // Логирование перед отправкой события
    console.log('📣 Отправка события text-to-speech.requested:', {
      description: 'Sending text-to-speech.requested event',
      telegram_id,
      voice_id,
      text_length: text.length,
      username,
      is_ru: isRu,
      bot_name: botName,
    })

    // Создаем уникальный ID для события
    const eventId = `tts-${telegram_id}-${Date.now()}-${uuidv4().substring(
      0,
      8
    )}`

    // Отправляем событие в Inngest для обработки
    await inngest.send({
      id: eventId,
      name: 'text-to-speech.requested',
      data: {
        text,
        voice_id,
        telegram_id: telegram_id.toString(),
        username,
        is_ru: isRu,
        bot_name: botName,
      },
    })

    console.log('✅ Событие успешно отправлено:', {
      description: 'Event successfully sent',
      event_id: eventId,
      telegram_id,
    })

    // Возвращаем предварительный ответ
    return {
      success: true,
      message: isRu
        ? 'Запрос на генерацию речи отправлен, ожидайте результат'
        : 'Speech generation request sent, please wait for the result',
    }
  } catch (error) {
    console.error('❌ Ошибка при отправке события text-to-speech:', {
      description: 'Error sending text-to-speech event',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    throw new Error(
      isRu
        ? 'Произошла ошибка при преобразовании текста в речь'
        : 'Error occurred while converting text to speech'
    )
  }
}
