#!/usr/bin/env node

/**
 * Скрипт для тестирования отправки фото и видео в группу @neuro_blogger_pulse
 */

// Импортируем необходимые модули без использования алиасов
const { Telegraf } = require('telegraf')

// Получаем BOT_TOKEN_1 из переменных окружения
require('dotenv').config()
const BOT_TOKEN = process.env.BOT_TOKEN_1

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN_1 не найден в .env файле')
  process.exit(1)
}

// Создаем экземпляр бота напрямую
const pulseBot = new Telegraf(BOT_TOKEN)

// Настройки для тестирования
const TEST_CONFIG = {
  chat_id: '@neuro_blogger_pulse',
  telegram_id: '123456789',
  username: 'test_user',
  is_ru: true,
  bot_name: 'neuro_blogger_bot',
  command: '/test',
  prompt: 'Тестовый промпт для проверки отправки медиа в группу',
}

/**
 * Функция для тестирования отправки изображения напрямую через telegramBot.sendPhoto
 */
async function testDirectImageSending() {
  console.log('🧪 Тестирование прямой отправки изображения')

  try {
    // Используем URL тестового изображения вместо локального файла
    const imageUrl =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'
    console.log(`📤 Отправка тестового изображения из URL: ${imageUrl}`)

    const caption = TEST_CONFIG.is_ru
      ? `@${TEST_CONFIG.username || 'Пользователь без username'} Telegram ID: ${TEST_CONFIG.telegram_id} сгенерировал тестовое изображение с промптом: ${TEST_CONFIG.prompt} \n\n Команда: ${TEST_CONFIG.command} \n\n Bot: @${TEST_CONFIG.bot_name}`
      : `@${TEST_CONFIG.username || 'User without username'} Telegram ID: ${TEST_CONFIG.telegram_id} generated a test image with prompt: ${TEST_CONFIG.prompt} \n\n Command: ${TEST_CONFIG.command} \n\n Bot: @${TEST_CONFIG.bot_name}`

    // Отправляем изображение непосредственно через URL
    await pulseBot.telegram.sendPhoto(
      TEST_CONFIG.chat_id,
      { url: imageUrl },
      { caption }
    )

    console.log('✅ Тест отправки изображения выполнен успешно')
  } catch (error) {
    console.error(
      '❌ Ошибка при тестировании отправки изображения:',
      error.message
    )
    console.error(error.stack)
  }
}

/**
 * Функция для тестирования отправки видео напрямую через telegramBot.sendVideo
 */
async function testVideoSending() {
  console.log('🧪 Тестирование отправки видео')

  try {
    // Используем URL тестового видео
    const videoUrl =
      'https://filesamples.com/samples/video/mp4/sample_640x360.mp4'
    console.log(`📤 Отправка тестового видео из URL: ${videoUrl}`)

    const caption = TEST_CONFIG.is_ru
      ? `@${TEST_CONFIG.username || 'Пользователь без username'} Telegram ID: ${TEST_CONFIG.telegram_id} сгенерировал тестовое видео с промптом: ${TEST_CONFIG.prompt} \n\n Команда: ${TEST_CONFIG.command} \n\n Bot: @${TEST_CONFIG.bot_name}`
      : `@${TEST_CONFIG.username || 'User without username'} Telegram ID: ${TEST_CONFIG.telegram_id} generated a test video with prompt: ${TEST_CONFIG.prompt} \n\n Command: ${TEST_CONFIG.command} \n\n Bot: @${TEST_CONFIG.bot_name}`

    // Отправляем видео непосредственно через URL
    await pulseBot.telegram.sendVideo(
      TEST_CONFIG.chat_id,
      { url: videoUrl },
      { caption }
    )

    console.log('✅ Тест отправки видео выполнен успешно')
  } catch (error) {
    console.error('❌ Ошибка при тестировании отправки видео:', error.message)
    console.error(error.stack)
  }
}

/**
 * Функция для тестирования отправки текстового сообщения
 */
async function testMessageSending() {
  console.log('🧪 Тестирование отправки текстового сообщения')

  try {
    const message = `🧪 Тестовое сообщение от скрипта test-pulse.js
📅 Время: ${new Date().toISOString()}
👤 ID: ${TEST_CONFIG.telegram_id}
🤖 Бот: @${TEST_CONFIG.bot_name}`

    await pulseBot.telegram.sendMessage(TEST_CONFIG.chat_id, message)
    console.log('✅ Тест отправки текстового сообщения выполнен успешно')
  } catch (error) {
    console.error(
      '❌ Ошибка при тестировании отправки текстового сообщения:',
      error.message
    )
    console.error(error.stack)
  }
}

/**
 * Основная функция для запуска всех тестов
 */
async function runAllTests() {
  console.log(
    '🚀 Запуск тестирования отправки медиа в группу @neuro_blogger_pulse'
  )

  try {
    // Тестируем отправку текстового сообщения
    await testMessageSending()

    // Тестируем отправку изображения
    await testDirectImageSending()

    // Тестируем отправку видео
    await testVideoSending()

    console.log('🎉 Все тесты успешно выполнены')
  } catch (error) {
    console.error('❌ Ошибка при выполнении тестов:', error.message)
    console.error(error.stack)
  }
}

// Запускаем все тесты
runAllTests()
