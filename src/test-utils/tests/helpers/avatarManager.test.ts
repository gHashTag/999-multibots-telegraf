import { TestResult } from '../../types'
import { AvatarManager } from '@/test-utils/helpers/avatarManager'
import { randomUUID } from 'crypto'
import { logger } from '@/utils/logger'

/**
 * Тест функциональности AvatarManager
 */
export async function testAvatarManager(): Promise<TestResult> {
  try {
    logger.info('🚀 Начало теста AvatarManager', {
      description: 'Starting AvatarManager test',
    })

    // Создаем экземпляр менеджера аватаров
    const avatarManager = new AvatarManager()

    // Создаем тестовые данные
    const testTelegramId = `${Date.now()}`
    const testBotName = `test-bot-${randomUUID().slice(0, 8)}`
    const testAvatarUrl = `https://example.com/avatar-${randomUUID().slice(0, 8)}.jpg`
    const testGroup = `${testBotName}_group`

    // Сохраняем список созданных аватаров для последующей очистки
    const createdAvatars: Array<{
      telegramId: string
      botName: string
      id?: number
    }> = []

    // Тест 1: Создание аватара бота
    logger.info('🔍 Тест 1: Создание аватара бота', {
      description: 'Test 1: Creating avatar bot',
    })

    const createdAvatar = await avatarManager.createAvatar({
      telegram_id: testTelegramId,
      bot_name: testBotName,
      avatar_url: testAvatarUrl,
      group: testGroup,
    })

    if (!createdAvatar) {
      throw new Error('Не удалось создать аватар бота')
    }

    createdAvatars.push({
      telegramId: testTelegramId,
      botName: testBotName,
      id: createdAvatar.id,
    })

    // Проверяем, что аватар бота был создан с правильными данными
    if (
      createdAvatar.telegram_id !== testTelegramId ||
      createdAvatar.bot_name !== testBotName ||
      createdAvatar.avatar_url !== testAvatarUrl ||
      createdAvatar.group !== testGroup
    ) {
      throw new Error('Созданный аватар бота имеет неверные данные')
    }

    logger.info('✅ Тест 1 пройден: Аватар бота успешно создан', {
      description: 'Test 1 passed: Avatar bot successfully created',
      telegramId: createdAvatar.telegram_id,
    })

    // Тест 2: Поиск аватара бота
    logger.info('🔍 Тест 2: Поиск аватара бота', {
      description: 'Test 2: Finding avatar bot',
    })

    const foundAvatar = await avatarManager.findAvatar({
      telegram_id: testTelegramId,
      bot_name: testBotName,
    })

    if (!foundAvatar) {
      throw new Error('Не удалось найти созданный аватар бота')
    }

    if (
      foundAvatar.telegram_id !== testTelegramId ||
      foundAvatar.bot_name !== testBotName
    ) {
      throw new Error('Найденный аватар бота не соответствует созданному')
    }

    logger.info('✅ Тест 2 пройден: Аватар бота успешно найден', {
      description: 'Test 2 passed: Avatar bot successfully found',
      telegramId: foundAvatar.telegram_id,
    })

    // Тест 3: Проверка предотвращения дублирования
    logger.info('🔍 Тест 3: Проверка предотвращения дублирования', {
      description: 'Test 3: Testing duplication prevention',
    })

    const duplicateAvatar = await avatarManager.createAvatar({
      telegram_id: testTelegramId,
      bot_name: testBotName,
      avatar_url: testAvatarUrl,
    })

    if (!duplicateAvatar) {
      throw new Error(
        'Не удалось получить существующий аватар при дублировании'
      )
    }

    if (
      duplicateAvatar.telegram_id !== createdAvatar.telegram_id ||
      duplicateAvatar.bot_name !== createdAvatar.bot_name
    ) {
      throw new Error(
        'Создан дубликат аватара бота вместо возврата существующего'
      )
    }

    logger.info('✅ Тест 3 пройден: Дублирование предотвращено', {
      description: 'Test 3 passed: Duplication prevented',
      telegramId: duplicateAvatar.telegram_id,
    })

    // Тест 4: Обновление аватара бота
    logger.info('🔍 Тест 4: Обновление аватара бота', {
      description: 'Test 4: Updating avatar bot',
    })

    if (!createdAvatar.id) {
      throw new Error('Созданный аватар не имеет ID для обновления')
    }

    const newAvatarUrl = `https://example.com/updated-avatar-${randomUUID().slice(0, 8)}.jpg`
    const newGroup = `${testBotName}_updated_group`

    // Создаем копию объекта для обновления
    const avatarToUpdate = { ...createdAvatar }
    avatarToUpdate.avatar_url = newAvatarUrl
    avatarToUpdate.group = newGroup

    const updatedAvatar = await avatarManager.updateAvatar(avatarToUpdate)

    if (!updatedAvatar) {
      throw new Error('Не удалось обновить аватар бота')
    }

    if (
      updatedAvatar.avatar_url !== newAvatarUrl ||
      updatedAvatar.group !== newGroup
    ) {
      throw new Error('Аватар бота не был корректно обновлен')
    }

    logger.info('✅ Тест 4 пройден: Аватар бота успешно обновлен', {
      description: 'Test 4 passed: Avatar bot successfully updated',
      telegramId: updatedAvatar.telegram_id,
      newAvatarUrl,
      newGroup,
    })

    // Тест 5: Получение аватаров пользователя
    logger.info('🔍 Тест 5: Получение аватаров пользователя', {
      description: 'Test 5: Getting user avatars',
    })

    // Создаем второй аватар для того же пользователя
    const secondBotName = `second-test-bot-${randomUUID().slice(0, 8)}`
    await avatarManager.createAvatar({
      telegram_id: testTelegramId,
      bot_name: secondBotName,
      avatar_url: testAvatarUrl,
    })

    createdAvatars.push({
      telegramId: testTelegramId,
      botName: secondBotName,
    })

    const userAvatars = await avatarManager.getUserAvatars(testTelegramId)

    if (!userAvatars || userAvatars.length < 2) {
      throw new Error('Не удалось получить все аватары пользователя')
    }

    const hasFirstBot = userAvatars.some(bot => bot.bot_name === testBotName)
    const hasSecondBot = userAvatars.some(bot => bot.bot_name === secondBotName)

    if (!hasFirstBot || !hasSecondBot) {
      throw new Error(
        'В списке аватаров пользователя отсутствуют созданные боты'
      )
    }

    logger.info(
      '✅ Тест 5 пройден: Успешно получены все аватары пользователя',
      {
        description: 'Test 5 passed: Successfully retrieved all user avatars',
        telegramId: testTelegramId,
        botsCount: userAvatars.length,
      }
    )

    // Тест 6: Получение аватаров бота
    logger.info('🔍 Тест 6: Получение аватаров бота', {
      description: 'Test 6: Getting bot avatars',
    })

    // Создаем аватар того же бота, но для другого пользователя
    const secondUserId = `${Date.now() + 1}`
    await avatarManager.createAvatar({
      telegram_id: secondUserId,
      bot_name: testBotName,
      avatar_url: testAvatarUrl,
    })

    createdAvatars.push({
      telegramId: secondUserId,
      botName: testBotName,
    })

    const botAvatars = await avatarManager.getBotAvatars(testBotName)

    if (!botAvatars || botAvatars.length < 2) {
      throw new Error('Не удалось получить все аватары бота')
    }

    const hasFirstUser = botAvatars.some(
      avatar => avatar.telegram_id === testTelegramId
    )
    const hasSecondUser = botAvatars.some(
      avatar => avatar.telegram_id === secondUserId
    )

    if (!hasFirstUser || !hasSecondUser) {
      throw new Error('В списке аватаров бота отсутствуют созданные аватары')
    }

    logger.info('✅ Тест 6 пройден: Успешно получены все аватары бота', {
      description: 'Test 6 passed: Successfully retrieved all bot avatars',
      botName: testBotName,
      avatarsCount: botAvatars.length,
    })

    // Тест 7: Удаление аватаров бота
    logger.info('🔍 Тест 7: Удаление аватаров бота', {
      description: 'Test 7: Deleting avatar bots',
    })

    // Очистка созданных тестовых данных
    for (const avatar of createdAvatars) {
      // Проверяем, есть ли у нас id аватара
      if (avatar.id) {
        const deletionSuccess = await avatarManager.deleteAvatar(avatar.id)

        if (!deletionSuccess) {
          throw new Error(
            `Не удалось удалить аватар бота для пользователя ${avatar.telegramId} и бота ${avatar.botName}`
          )
        }
      } else {
        // Если id нет, находим аватар по telegram_id и bot_name
        const foundAvatar = await avatarManager.findAvatar({
          telegram_id: avatar.telegramId,
          bot_name: avatar.botName,
        })

        if (foundAvatar && foundAvatar.id) {
          const deletionSuccess = await avatarManager.deleteAvatar(
            foundAvatar.id
          )

          if (!deletionSuccess) {
            throw new Error(
              `Не удалось удалить аватар бота для пользователя ${avatar.telegramId} и бота ${avatar.botName}`
            )
          }
        }
      }

      // Проверяем, что аватар действительно удален
      const deletedAvatar = await avatarManager.findAvatar({
        telegram_id: avatar.telegramId,
        bot_name: avatar.botName,
      })

      if (deletedAvatar) {
        throw new Error(
          `Аватар бота пользователя ${avatar.telegramId} и бота ${avatar.botName} не был удален`
        )
      }
    }

    logger.info('✅ Тест 7 пройден: Аватары бота успешно удалены', {
      description: 'Test 7 passed: Avatar bots successfully deleted',
      deletedCount: createdAvatars.length,
    })

    return {
      success: true,
      message: 'Тесты AvatarManager успешно пройдены',
      name: 'AvatarManager Test',
    }
  } catch (error: any) {
    logger.error('❌ Ошибка при тестировании AvatarManager', {
      description: 'Error in AvatarManager test',
      error: error.message,
      stack: error.stack,
    })

    return {
      success: false,
      message: `Ошибка при тестировании AvatarManager: ${error.message}`,
      name: 'AvatarManager Test',
    }
  }
}

// Выполняем тест, если файл запущен напрямую
if (require.main === module) {
  ;(async () => {
    const result = await testAvatarManager()
    console.log(
      `Результат тестирования: ${result.success ? 'Успешно' : 'Ошибка'}`
    )
    console.log(`Сообщение: ${result.message}`)
    process.exit(result.success ? 0 : 1)
  })()
}
