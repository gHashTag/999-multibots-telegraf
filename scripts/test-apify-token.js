#!/usr/bin/env node

const { ApifyClient } = require('apify-client')

async function testApifyToken() {
  console.log('🔍 Проверяем новый токен Apify...')

  const apifyToken = process.env.APIFY_TOKEN

  if (!apifyToken) {
    console.error('❌ APIFY_TOKEN не установлен в переменных окружения')
    process.exit(1)
  }

  console.log('✅ APIFY_TOKEN найден:', apifyToken.substring(0, 10) + '...')

  try {
    // Создаем клиент
    const client = new ApifyClient({
      token: apifyToken,
    })

    console.log('\n🔍 Проверяем валидность токена...')

    // Проверяем токен через получение информации о пользователе
    const user = await client.user().get()
    console.log('✅ Токен валиден!')
    console.log('👤 Пользователь:', user.username || user.email || 'Неизвестно')
    console.log('💰 Кредиты:', user.usageCredits || 'Неизвестно')

    console.log('\n🎬 Тестируем Instagram актор...')

    const actorId = 'easyapi/instagram-reels-downloader'
    const testUrl =
      'https://www.instagram.com/reel/DJ0mMppPV6N/?igsh=amQxZHE1bmVjdmY='

    // Проверяем, доступен ли актор
    try {
      const actor = await client.actor(actorId).get()
      console.log('✅ Актор найден:', actor.name)
      console.log('📊 Статус:', actor.isPublic ? 'Публичный' : 'Приватный')

      // Проверяем можем ли мы запустить актор
      console.log('\n🚀 Пытаемся запустить актор с тестовой ссылкой...')

      const run = await client.actor(actorId).call(
        {
          links: [testUrl],
        },
        {
          timeout: 60000, // 60 секунд таймаут
        }
      )

      console.log('✅ Актор запущен успешно!')
      console.log('🆔 ID запуска:', run.id)
      console.log('📊 Статус:', run.status)

      // Получаем результаты
      console.log('\n📥 Получаем результаты...')
      const { items } = await client.dataset(run.defaultDatasetId).listItems()

      if (items && items.length > 0) {
        const result = items[0]
        console.log('✅ Результат получен!')
        console.log('📺 Название:', result.title || 'Неизвестно')
        console.log('👤 Автор:', result.author || 'Неизвестно')
        console.log(
          '🎥 Видео найдено:',
          result.medias ? result.medias.length : 0
        )

        if (result.medias && result.medias.length > 0) {
          const video = result.medias.find(m => m.type === 'video')
          if (video) {
            console.log(
              '✅ Видео ссылка получена:',
              video.url.substring(0, 50) + '...'
            )
            console.log('🎯 Качество:', video.quality)
          }
        }

        console.log('\n🎉 ОТЛИЧНО! Apify полностью работает с новым токеном!')
        console.log('✅ Instagram транскрибация будет работать через Apify')
      } else {
        console.log('⚠️ Результаты пустые, но актор запустился')
        console.log('🔄 Возможно нужно подождать или проверить ссылку')
      }
    } catch (actorError) {
      console.error('❌ Ошибка с актором:', actorError.message)

      if (actorError.message.includes('rent a paid Actor')) {
        console.log('\n💰 Нужна платная подписка на актор')
        console.log('📝 Но токен валиден, fallback методы будут работать')
      } else if (actorError.message.includes('not found')) {
        console.log('\n🔍 Актор не найден, возможно изменился ID')
      } else {
        console.log('\n🔄 Другая ошибка, но токен работает')
      }
    }
  } catch (error) {
    console.error('❌ Ошибка проверки токена:', error.message)

    if (error.message.includes('Invalid token')) {
      console.log('\n🔑 Токен недействителен. Нужно получить новый:')
      console.log('1. Зайдите на https://console.apify.com/')
      console.log('2. Настройки → Integrations → API tokens')
      console.log('3. Создайте новый токен')
      console.log('4. Обновите APIFY_TOKEN в .env')
    } else if (
      error.message.includes('network') ||
      error.message.includes('timeout')
    ) {
      console.log('\n🌐 Проблема с сетью, попробуйте позже')
    } else {
      console.log('\n🔧 Неизвестная ошибка, проверьте настройки')
    }

    process.exit(1)
  }
}

console.log('🧪 Тест токена Apify для Instagram транскрибации')
console.log('='.repeat(50))

testApifyToken().catch(console.error)
