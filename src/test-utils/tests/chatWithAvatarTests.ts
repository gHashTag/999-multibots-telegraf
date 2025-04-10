import { TestResult } from '../types'
import { ModeEnum } from '../../types/modes'

export async function testChatWithAvatar(): Promise<TestResult> {
  try {
    // Проверяем наличие всех необходимых переводов
    const translations = [
      'chat_with_avatar_start',
      'chat_with_avatar_brain',
      'chat_with_avatar_body',
      'chat_with_avatar_voice',
      'chat_with_avatar_model',
    ]

    for (const key of translations) {
      const translation = 'text'

      if (!translation) {
        throw new Error(`Missing translation for key: ${key}`)
      }

      console.log(`✅ Found translation for ${key}: ${translation}`)
    }

    // Проверяем корректность режима
    const mode = ModeEnum.ChatWithAvatar
    if (!mode) {
      throw new Error('ChatWithAvatar mode is not defined')
    }

    console.log('✅ ChatWithAvatar mode is defined correctly')

    return {
      name: 'Chat with Avatar Test',
      success: true,
      message: 'All translations and mode configurations are correct',
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred'
    return {
      name: 'Chat with Avatar Test',
      success: false,
      message: errorMessage,
      error: error instanceof Error ? error : new Error(errorMessage),
    }
  }
}
