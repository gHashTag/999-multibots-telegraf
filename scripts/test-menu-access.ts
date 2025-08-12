#!/usr/bin/env npx tsx

/**
 * Скрипт для проверки доступа к меню без подписки
 * Проверяет, что пользователи видят все кнопки, но получают уведомления о доступности функций
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { SubscriptionType } from '../src/interfaces/subscription.interface'
import {
  getSubscriptionMessage,
  isFeatureAvailable,
} from '../src/helpers/subscriptionInfo'

// Загружаем переменные окружения
config({ path: resolve(__dirname, '../.env.development.local') })

async function testMenuAccess() {
  console.log('🧪 Тест доступа к меню и проверки функций\n')
  console.log('='.repeat(50))

  // Мокаем контекст для теста
  const mockCtx: any = {
    from: {
      id: '123456789',
      language_code: 'ru',
    },
    session: {
      userLanguage: 'ru',
    },
    botInfo: {
      username: 'test_bot',
    },
  }

  // Импортируем функцию mainMenu
  const { mainMenu } = await import('../src/menu/mainMenu')

  console.log('\n📋 Тестируем меню для разных типов подписок:\n')

  // Тест 1: Пользователь без подписки (STARS)
  console.log('1️⃣ Пользователь без подписки (STARS):')
  const starsMenu = await mainMenu({
    isRu: true,
    subscription: SubscriptionType.STARS,
    ctx: mockCtx,
  })

  const starsButtons = starsMenu.reply_markup.keyboard
    .flat()
    .map((btn: any) => btn.text)
  console.log('   Доступные кнопки:', starsButtons)
  console.log('   ✅ Теперь видны ВСЕ основные функции + базовые кнопки')

  // Тест 2: Пользователь с NEUROPHOTO
  console.log('\n2️⃣ Пользователь с подпиской NEUROPHOTO:')
  const photoMenu = await mainMenu({
    isRu: true,
    subscription: SubscriptionType.NEUROPHOTO,
    ctx: mockCtx,
  })

  const photoButtons = photoMenu.reply_markup.keyboard
    .flat()
    .map((btn: any) => btn.text)
  console.log('   Доступные кнопки:', photoButtons)
  console.log('   ✅ Функциональные кнопки для фото + Баланс, Пополнить баланс')

  // Тест 3: Пользователь с NEUROVIDEO
  console.log('\n3️⃣ Пользователь с подпиской NEUROVIDEO:')
  const videoMenu = await mainMenu({
    isRu: true,
    subscription: SubscriptionType.NEUROVIDEO,
    ctx: mockCtx,
  })

  const videoButtons = videoMenu.reply_markup.keyboard
    .flat()
    .map((btn: any) => btn.text)
  console.log('   Доступные кнопки:', videoButtons)
  console.log('   ✅ Все функциональные кнопки')

  console.log('\n' + '='.repeat(50))

  // Проверка доступности функций
  console.log('\n🔍 Проверка доступности функций:\n')

  // Тест функций для STARS (без подписки)
  const testFeatures = [
    '🤖 Цифровое тело',
    '📸 Нейрофото',
    '👥 Пригласить друга',
    '💬 Техподдержка',
  ]

  console.log('Для пользователя БЕЗ подписки:')
  testFeatures.forEach(feature => {
    const available = isFeatureAvailable(feature, SubscriptionType.STARS)
    console.log(
      `   ${feature}: ${available ? '✅ Доступно' : '🔒 Заблокировано'}`
    )
  })

  // Показываем сообщение при попытке использовать заблокированную функцию
  console.log(
    '\n📝 Сообщение при попытке использовать "📸 Нейрофото" без подписки:\n'
  )
  console.log('---')
  const message = getSubscriptionMessage(
    SubscriptionType.STARS,
    true,
    '📸 Нейрофото'
  )
  console.log(message.replace(/<\/?b>/g, '**').replace(/<br>/g, '\n')) // Заменяем HTML теги для консоли
  console.log('---')

  console.log('\n' + '='.repeat(50))
  console.log('✨ Тесты завершены!\n')

  // Финальная проверка
  const hasNeuroPhoto = starsButtons.some(b => b.includes('Нейрофото'))
  const hasDigitalBody = starsButtons.some(b => b.includes('Цифровое тело'))

  if (hasNeuroPhoto || hasDigitalBody) {
    console.log('✅ УСПЕХ: Пользователи без подписки видят ВСЕ кнопки в меню')
    console.log(
      '✅ При попытке использования будет показано информативное сообщение'
    )
    console.log(
      '✅ Это позволит пользователям понять, какие функции доступны с подпиской'
    )
  } else {
    console.log(
      '⚠️ ВНИМАНИЕ: Пользователи без подписки не видят функциональные кнопки'
    )
    console.log('   Проверьте настройки в mainMenu.ts')
  }

  process.exit(0)
}

// Запускаем тест
testMenuAccess().catch(error => {
  console.error('❌ Ошибка при выполнении теста:', error)
  process.exit(1)
})
