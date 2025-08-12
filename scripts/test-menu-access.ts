#!/usr/bin/env npx tsx

/**
 * Скрипт для проверки доступа к меню без подписки
 * Проверяет, что пользователи без подписки могут видеть меню с ограниченными функциями
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { SubscriptionType } from '../src/interfaces/subscription.interface'

// Загружаем переменные окружения
config({ path: resolve(__dirname, '../.env.development.local') })

async function testMenuAccess() {
  console.log('🧪 Тест доступа к меню без подписки\n')
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
  console.log(
    '   ✅ Должны быть: Пригласить друга, Техподдержка, Язык, Оформить подписку'
  )

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
  console.log(
    '   ✅ Должны быть функциональные кнопки + Баланс, Пополнить баланс'
  )

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
  console.log('   ✅ Должны быть все функциональные кнопки')

  console.log('\n' + '='.repeat(50))
  console.log('✨ Тесты завершены!\n')

  // Проверки
  const hasInviteInStars = starsButtons.includes('👥 Пригласить друга')
  const hasSupportInStars = starsButtons.includes('💬 Техподдержка')
  const hasSubscribeInStars = starsButtons.includes('💫 Оформить подписку')

  if (hasInviteInStars && hasSupportInStars && hasSubscribeInStars) {
    console.log(
      '✅ УСПЕХ: Пользователи без подписки могут видеть меню с базовыми функциями'
    )
  } else {
    console.log('❌ ОШИБКА: Меню для пользователей без подписки неполное')
    console.log('   Пригласить друга:', hasInviteInStars ? '✅' : '❌')
    console.log('   Техподдержка:', hasSupportInStars ? '✅' : '❌')
    console.log('   Оформить подписку:', hasSubscribeInStars ? '✅' : '❌')
  }

  process.exit(0)
}

// Запускаем тест
testMenuAccess().catch(error => {
  console.error('❌ Ошибка при выполнении теста:', error)
  process.exit(1)
})
